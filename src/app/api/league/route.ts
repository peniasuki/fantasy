import { NextResponse } from "next/server";
import { DEFAULT_SETTINGS } from "fantasy-rules";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/firebase-admin";
import { LEAGUE_ID, requireMember } from "@/lib/league";

function code() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

export async function GET() {
  try {
    const user = await requireUser();
    const leagueSnap = await db().collection("leagues").doc(LEAGUE_ID).get();
    if (!leagueSnap.exists) {
      return NextResponse.json({ league: null, member: null, user });
    }
    const memberSnap = await db()
      .collection("leagues")
      .doc(LEAGUE_ID)
      .collection("members")
      .doc(user.uid)
      .get();
    const membersSnap = await db().collection("leagues").doc(LEAGUE_ID).collection("members").get();
    const members = membersSnap.docs
      .map((doc) => doc.data())
      .sort((a, b) => b.points - a.points || a.displayName.localeCompare(b.displayName));
    return NextResponse.json({
      league: leagueSnap.data(),
      member: memberSnap.data() ?? null,
      members,
      user,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ERROR";
    return NextResponse.json({ error: message }, { status: message === "UNAUTHENTICATED" ? 401 : 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = (await request.json()) as { action: "create" | "join"; name?: string; inviteCode?: string };
    const leagueRef = db().collection("leagues").doc(LEAGUE_ID);
    const leagueSnap = await leagueRef.get();

    if (body.action === "create") {
      if (leagueSnap.exists) {
        return NextResponse.json({ error: "La liga ya existe. Únete con el código." }, { status: 400 });
      }
      const inviteCode = code();
      await leagueRef.set({
        name: body.name?.trim() || "Liga Fantasy",
        inviteCode,
        createdBy: user.uid,
        createdAt: Date.now(),
        settings: DEFAULT_SETTINGS,
        scoringSystem: "stats",
      });
      await leagueRef.collection("members").doc(user.uid).set({
        uid: user.uid,
        role: "admin",
        displayName: user.name || user.email || "Admin",
        picture: user.picture,
        balance: DEFAULT_SETTINGS.initialBalance,
        points: 0,
        joinedAt: Date.now(),
      });
      return NextResponse.json({ ok: true, inviteCode });
    }

    if (!leagueSnap.exists) {
      return NextResponse.json({ error: "Todavía no hay liga." }, { status: 404 });
    }
    const league = leagueSnap.data()!;
    if ((body.inviteCode || "").toUpperCase() !== league.inviteCode) {
      return NextResponse.json({ error: "Código incorrecto." }, { status: 403 });
    }
    const members = await leagueRef.collection("members").get();
    if (members.size >= 8 && !members.docs.some((d) => d.id === user.uid)) {
      return NextResponse.json({ error: "La liga está llena (8)." }, { status: 400 });
    }
    await leagueRef.collection("members").doc(user.uid).set(
      {
        uid: user.uid,
        role: members.empty ? "admin" : "manager",
        displayName: user.name || user.email || "Manager",
        picture: user.picture,
        balance: league.settings?.initialBalance ?? DEFAULT_SETTINGS.initialBalance,
        points: 0,
        joinedAt: Date.now(),
      },
      { merge: true },
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ERROR";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH() {
  try {
    const user = await requireUser();
    await requireMember(user.uid);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ERROR";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
