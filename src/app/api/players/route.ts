import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/firebase-admin";
import { LEAGUE_ID, requireMember } from "@/lib/league";

export async function GET() {
  try {
    const user = await requireUser();
    await requireMember(user.uid);
    const [playersSnap, ownedSnap] = await Promise.all([
      db().collection("players").get(),
      db().collection("leagues").doc(LEAGUE_ID).collection("ownership").get(),
    ]);
    const ownership = Object.fromEntries(ownedSnap.docs.map((d) => [d.data().playerId, d.data()]));
    const players = playersSnap.docs.map((d) => {
      const data = d.data() as { vm?: number; name?: string; position?: string; teamName?: string };
      return {
        id: d.id,
        ...data,
        ownerId: ownership[d.id]?.ownerId ?? null,
      };
    });
    players.sort((a, b) => (b.vm ?? 0) - (a.vm ?? 0));
    return NextResponse.json({ players });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ERROR";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
