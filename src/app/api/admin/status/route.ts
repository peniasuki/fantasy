import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getLeague, LEAGUE_ID } from "@/lib/league";
import { db } from "@/lib/firebase-admin";
import { adminEmail } from "@/lib/roles";

export async function GET() {
  try {
    const user = await requireUser();
    const league = await getLeague();
    const memberSnap = league
      ? await db().collection("leagues").doc(LEAGUE_ID).collection("members").doc(user.uid).get()
      : null;
    return NextResponse.json({
      user: { uid: user.uid, email: user.email, name: user.name, appRole: user.appRole },
      hasLeague: Boolean(league),
      isAdmin: user.appRole === "admin",
      role: memberSnap?.data()?.role ?? user.appRole,
      adminEmail: adminEmail(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ERROR";
    return NextResponse.json({ error: message }, { status: message === "UNAUTHENTICATED" ? 401 : 500 });
  }
}
