import { NextResponse } from "next/server";
import { DEFAULT_SETTINGS } from "fantasy-rules";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/firebase-admin";
import { LEAGUE_ID, requireMember } from "@/lib/league";
import { appRoleFromEmail, isAdminEmail } from "@/lib/roles";

function code() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

export async function GET() {
  try {
    const user = await requireUser();
    const leagueSnap = await db().collection("leagues").doc(LEAGUE_ID).get();
    if (!leagueSnap.exists) {
      return NextResponse.json({ league: null, member: null, members: [], user });
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
    const role = appRoleFromEmail(user.email);

    if (body.action === "create") {
      if (!isAdminEmail(user.email)) {
        return NextResponse.json(
          { error: "Solo el administrador puede crear la liga. Pídele el código de invitación." },
          { status: 403 },
        );
      }
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
      const userDoc = (await db().collection("users").doc(user.uid).get()).data() ?? {};
      const displayName =
        String(userDoc.displayName || "").trim() || user.name || user.email || "Admin";
      const teamName = String(userDoc.teamName || "").trim() || null;
      await leagueRef.collection("members").doc(user.uid).set({
        uid: user.uid,
        role: "admin",
        displayName,
        teamName,
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
    if (members.size >= 12 && !members.docs.some((d) => d.id === user.uid)) {
      return NextResponse.json({ error: "La liga está llena (12)." }, { status: 400 });
    }
    const existing = members.docs.find((d) => d.id === user.uid);
    const userDoc = (await db().collection("users").doc(user.uid).get()).data() ?? {};
    const displayName =
      (existing?.data()?.displayName as string | undefined)?.trim() ||
      String(userDoc.displayName || "").trim() ||
      user.name ||
      user.email ||
      "Manager";
    const teamName =
      (existing?.data()?.teamName as string | null | undefined) ??
      (String(userDoc.teamName || "").trim() || null);
    await leagueRef.collection("members").doc(user.uid).set(
      {
        uid: user.uid,
        role, // admin solo si email allowlist; nunca por “primer miembro”
        displayName,
        teamName,
        picture: user.picture,
        balance: existing?.data()?.balance ?? league.settings?.initialBalance ?? DEFAULT_SETTINGS.initialBalance,
        points: existing?.data()?.points ?? 0,
        joinedAt: existing?.data()?.joinedAt ?? Date.now(),
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
