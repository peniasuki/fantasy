import { NextResponse } from "next/server";
import type { WriteBatch } from "firebase-admin/firestore";
import { requireJobOrAdmin } from "@/lib/auth";
import {
  getMasterCalendar,
  matchdayDueForAvailabilitySync,
  type CalendarMatchday,
} from "@/lib/calendar";
import { db } from "@/lib/firebase-admin";
import { fetchJpAvailabilityPages, type JpAvailabilityEntry } from "@/lib/jp-availability";
import { LEAGUE_ID } from "@/lib/league";
import { deriveAlignable } from "@/lib/players";

const BATCH_LIMIT = 400;

async function commitInChunks(writes: Array<(batch: WriteBatch) => void>) {
  for (let i = 0; i < writes.length; i += BATCH_LIMIT) {
    const batch = db().batch();
    for (const write of writes.slice(i, i + BATCH_LIMIT)) write(batch);
    await batch.commit();
  }
}

function pickStatus(entries: JpAvailabilityEntry[]): {
  injured: boolean;
  suspended: boolean;
  doubt: boolean;
  availabilityStatus: string | null;
} {
  const injuredEntry = entries.find((e) => e.kind === "injured");
  const suspendedEntry = entries.find((e) => e.kind === "suspended");
  const doubtEntry = entries.find((e) => e.kind === "doubt");
  const observation = entries.find((e) => e.kind === "observation");

  const injured = Boolean(injuredEntry);
  const suspended = Boolean(suspendedEntry);
  const doubt = Boolean(doubtEntry) && !injured;

  let availabilityStatus: string | null = "Disponible";
  if (suspendedEntry) {
    availabilityStatus = suspendedEntry.reason || "Sancionado";
  } else if (injuredEntry) {
    availabilityStatus = injuredEntry.reason || "Lesionado";
  } else if (doubtEntry) {
    availabilityStatus = doubtEntry.reason || "Duda";
  } else if (observation) {
    availabilityStatus = observation.reason || "Disponible en observación";
  }

  return { injured, suspended, doubt, availabilityStatus };
}

export async function POST(request: Request) {
  try {
    await requireJobOrAdmin(request);
    const url = new URL(request.url);
    const force = url.searchParams.get("force") === "1";
    const matchdayParam = url.searchParams.get("matchday");
    const calendar = getMasterCalendar();
    const now = Date.now();

    let matchday: CalendarMatchday | null = null;
    if (matchdayParam) {
      const n = Number(matchdayParam);
      matchday = calendar.matchdays.find((md) => md.number === n) ?? null;
      if (!matchday) {
        return NextResponse.json({ error: `Jornada ${matchdayParam} no existe en el calendario maestro.` }, { status: 400 });
      }
    } else {
      matchday = matchdayDueForAvailabilitySync(calendar, new Date(now));
    }

    if (!matchday && !force) {
      return NextResponse.json({
        ok: true,
        skipped: true,
        reason: "Hoy no es víspera de jornada (23:00). Usa ?force=1 o ?matchday=N.",
        madridDate: new Intl.DateTimeFormat("en-CA", {
          timeZone: "Europe/Madrid",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(new Date(now)),
      });
    }

    const { injuredDoubt, suspended } = await fetchJpAvailabilityPages();
    const byPlayer = new Map<string, JpAvailabilityEntry[]>();
    for (const entry of [...injuredDoubt, ...suspended]) {
      const list = byPlayer.get(entry.playerId) ?? [];
      list.push(entry);
      byPlayer.set(entry.playerId, list);
    }

    const playersSnap = await db().collection("players").get();
    const writes: Array<(batch: WriteBatch) => void> = [];
    let updated = 0;
    let nonAlignable = 0;
    const nonAlignableIds = new Set<string>();

    for (const doc of playersSnap.docs) {
      const data = doc.data();
      if (data.active === false) continue;
      const entries = byPlayer.get(doc.id) ?? [];
      const flags = pickStatus(entries);
      // Si no aparece en ninguna lista JP, queda disponible (limpia estados previos).
      if (entries.length === 0) {
        flags.injured = false;
        flags.suspended = false;
        flags.doubt = false;
        flags.availabilityStatus = "Disponible";
      }
      const alignable = deriveAlignable(flags);
      if (!alignable) {
        nonAlignable += 1;
        nonAlignableIds.add(doc.id);
      }
      writes.push((batch) =>
        batch.set(
          doc.ref,
          {
            injured: flags.injured,
            suspended: flags.suspended,
            doubt: flags.doubt,
            availabilityStatus: flags.availabilityStatus,
            alignable,
            availabilityUpdatedAt: now,
            availabilityMatchday: matchday?.number ?? null,
            updatedAt: now,
          },
          { merge: true },
        ),
      );
      updated += 1;
    }

    // Huecos: sacar de alineaciones a no alineables → 0 puntos ese puesto.
    const lineupsSnap = await db().collection("leagues").doc(LEAGUE_ID).collection("lineups").get();
    let lineupsPatched = 0;
    for (const doc of lineupsSnap.docs) {
      const lineup = doc.data();
      const slots = (lineup.slots ?? []) as { slot: number; position: string; playerId: string | null }[];
      let changed = false;
      const next = slots.map((slot) => {
        if (slot.playerId && nonAlignableIds.has(slot.playerId)) {
          changed = true;
          return { ...slot, playerId: null };
        }
        return slot;
      });
      if (changed) {
        lineupsPatched += 1;
        writes.push((batch) =>
          batch.set(
            doc.ref,
            { slots: next, updatedAt: now, availabilityClearedAt: now },
            { merge: true },
          ),
        );
      }
    }

    await db()
      .collection("system")
      .doc("availability")
      .set(
        {
          updatedAt: now,
          matchday: matchday?.number ?? null,
          matchdayName: matchday?.name ?? null,
          lockAt: matchday?.lockAt ?? null,
          sources: {
            lesionados: "https://www.jornadaperfecta.com/lesionados/",
            sancionados: "https://www.jornadaperfecta.com/sancionados/",
          },
          counts: {
            jpInjuredDoubt: injuredDoubt.length,
            jpSuspended: suspended.length,
            playersUpdated: updated,
            nonAlignable,
            lineupsPatched,
          },
        },
        { merge: true },
      );

    await commitInChunks(writes);

    return NextResponse.json({
      ok: true,
      skipped: false,
      matchday: matchday
        ? { number: matchday.number, name: matchday.name, startsOn: matchday.startsOn, lockAt: matchday.lockAt }
        : null,
      forced: force && !matchday,
      jp: {
        injured: injuredDoubt.filter((e) => e.kind === "injured").length,
        doubt: injuredDoubt.filter((e) => e.kind === "doubt").length,
        observation: injuredDoubt.filter((e) => e.kind === "observation").length,
        suspended: suspended.length,
      },
      playersUpdated: updated,
      nonAlignable,
      lineupsPatched,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ERROR";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
