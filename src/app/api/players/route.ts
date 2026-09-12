import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/firebase-admin";
import { LEAGUE_ID, requireMember } from "@/lib/league";

export async function GET() {
  try {
    const user = await requireUser();
    await requireMember(user.uid);
    const [playersSnap, ownedSnap, membersSnap] = await Promise.all([
      db().collection("players").get(),
      db().collection("leagues").doc(LEAGUE_ID).collection("ownership").get(),
      db().collection("leagues").doc(LEAGUE_ID).collection("members").get(),
    ]);
    const members = Object.fromEntries(
      membersSnap.docs.map((d) => [d.id, { displayName: d.data().displayName ?? d.id }]),
    );
    const ownership = Object.fromEntries(ownedSnap.docs.map((d) => [d.data().playerId, d.data()]));
    const players = playersSnap.docs.map((d) => {
      const data = d.data() as {
        vm?: number;
        currentPrice?: number;
        name?: string;
        position?: string;
        teamName?: string;
        active?: boolean;
        photo?: string;
        lastTransferPrice?: number | null;
        pointsHome?: number;
        pointsAway?: number;
        pointsTotal?: number;
      };
      if (data.active === false) return null;
      const ownerId = ownership[d.id]?.ownerId ? String(ownership[d.id].ownerId) : null;
      return {
        id: d.id,
        ...data,
        vm: data.currentPrice ?? data.vm ?? 0,
        pointsHome: Number(data.pointsHome ?? 0),
        pointsAway: Number(data.pointsAway ?? 0),
        pointsTotal: Number(data.pointsTotal ?? 0),
        ownerId,
        ownerName: ownerId ? members[ownerId]?.displayName ?? ownerId : null,
      };
    }).filter(Boolean);
    players.sort((a, b) => ((b as { vm?: number }).vm ?? 0) - ((a as { vm?: number }).vm ?? 0));
    return NextResponse.json({ players });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ERROR";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
