import { NextResponse } from "next/server";
import type { WriteBatch } from "firebase-admin/firestore";
import { requireJobOrAdmin } from "@/lib/auth";
import { getMasterCalendar } from "@/lib/calendar";
import { db } from "@/lib/firebase-admin";

const BATCH_LIMIT = 400;

async function commitInChunks(writes: Array<(batch: WriteBatch) => void>) {
  for (let i = 0; i < writes.length; i += BATCH_LIMIT) {
    const batch = db().batch();
    for (const write of writes.slice(i, i + BATCH_LIMIT)) write(batch);
    await batch.commit();
  }
}

/** Publica el calendario maestro (LaLiga) en Firestore. */
export async function POST(request: Request) {
  try {
    await requireJobOrAdmin(request);
    const calendar = getMasterCalendar();
    const now = Date.now();
    const writes: Array<(batch: WriteBatch) => void> = [];

    writes.push((batch) =>
      batch.set(db().collection("system").doc("calendar"), {
        ...calendar,
        publishedAt: now,
      }),
    );

    for (const md of calendar.matchdays) {
      writes.push((batch) =>
        batch.set(db().collection("calendar").doc(`jornada_${md.number}`), {
          ...md,
          season: calendar.season,
          competition: calendar.competition,
          updatedAt: now,
        }),
      );
    }

    await commitInChunks(writes);
    return NextResponse.json({
      ok: true,
      season: calendar.season,
      matchdays: calendar.matchdays.length,
      sourceUrl: calendar.sourceUrl,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ERROR";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
