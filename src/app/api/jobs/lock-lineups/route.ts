import { NextResponse } from "next/server";
import { requireJobOrAdmin } from "@/lib/auth";
import { db } from "@/lib/firebase-admin";
import { getMasterCalendar, matchdayByNumber } from "@/lib/calendar";
import { LEAGUE_ID } from "@/lib/league";
import { getNextUnscoredMatchday } from "@/lib/lineup-lock";

/**
 * Cierra alineaciones de una jornada (por defecto la próxima no puntuada).
 * Hasta que esa jornada se puntúe, nadie puede editar el once.
 */
export async function POST(request: Request) {
  try {
    const admin = await requireJobOrAdmin(request);
    const url = new URL(request.url);
    const rawMd = url.searchParams.get("matchday");
    let matchdayNum: number | null = rawMd ? Number(rawMd) : null;

    if (matchdayNum != null && (!Number.isInteger(matchdayNum) || matchdayNum < 1 || matchdayNum > 38)) {
      return NextResponse.json({ error: "Jornada inválida." }, { status: 400 });
    }

    const upcoming = await getNextUnscoredMatchday();
    if (matchdayNum == null) {
      if (!upcoming) {
        return NextResponse.json({ error: "No hay jornada pendiente de puntuar." }, { status: 400 });
      }
      matchdayNum = upcoming.number;
    }

    const md = matchdayByNumber(matchdayNum, getMasterCalendar());
    if (!md) {
      return NextResponse.json({ error: "Jornada no está en el calendario." }, { status: 404 });
    }

    const now = Date.now();
    const lockAt = new Date(now).toISOString();
    await db()
      .collection("leagues")
      .doc(LEAGUE_ID)
      .collection("lineupLocks")
      .doc(String(matchdayNum))
      .set({
        matchday: matchdayNum,
        locked: true,
        lockAt,
        lockedAt: now,
        lockedBy: admin?.uid ?? "job",
        source: "admin",
        calendarLockAt: md.lockAt,
      });

    return NextResponse.json({
      ok: true,
      matchday: matchdayNum,
      lockAt,
      message: `Alineaciones cerradas para la jornada ${matchdayNum}.`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ERROR";
    const status = message === "UNAUTHENTICATED" ? 401 : message.startsWith("Forbidden") ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
