import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/firebase-admin";
import { LEAGUE_ID } from "@/lib/league";
import { adminEmail } from "@/lib/roles";

function normalizeDisplayName(raw: unknown): string {
  return String(raw ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 32);
}

function normalizeTeamName(raw: unknown): string {
  return String(raw ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 40);
}

async function loadProfile(uid: string) {
  const [userSnap, memberSnap] = await Promise.all([
    db().collection("users").doc(uid).get(),
    db().collection("leagues").doc(LEAGUE_ID).collection("members").doc(uid).get(),
  ]);
  return {
    userDoc: userSnap.data() ?? {},
    memberDoc: memberSnap.exists ? memberSnap.data() : null,
    memberRef: memberSnap.ref,
    userRef: userSnap.ref,
  };
}

/** Perfil de sesión + onboarding de manager. */
export async function GET() {
  try {
    const user = await requireUser();
    const { userDoc, memberDoc, userRef, memberRef } = await loadProfile(user.uid);

    let displayName = normalizeDisplayName(userDoc.displayName);
    let teamName = normalizeTeamName(userDoc.teamName);
    let profileCompletedAt = Number(userDoc.profileCompletedAt ?? 0) || null;

    // Migración suave: managers ya en liga no se bloquean en onboarding.
    if (!profileCompletedAt && memberDoc?.displayName) {
      displayName = normalizeDisplayName(memberDoc.displayName) || displayName;
      teamName = normalizeTeamName(memberDoc.teamName) || teamName;
      profileCompletedAt = Date.now();
      await userRef.set(
        {
          displayName: displayName || user.name || "Manager",
          teamName: teamName || "",
          profileCompletedAt,
          updatedAt: Date.now(),
        },
        { merge: true },
      );
      displayName = normalizeDisplayName(displayName || user.name || "Manager");
    }

    const profileComplete = Boolean(profileCompletedAt && displayName);

    return NextResponse.json({
      uid: user.uid,
      email: user.email,
      name: user.name,
      picture: user.picture,
      appRole: user.appRole,
      isAdmin: user.appRole === "admin",
      adminEmail: adminEmail(),
      displayName: displayName || null,
      teamName: teamName || null,
      profileComplete,
      profileCompletedAt,
      isMember: Boolean(memberDoc),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ERROR";
    return NextResponse.json({ error: message }, { status: message === "UNAUTHENTICATED" ? 401 : 500 });
  }
}

/**
 * Completar perfil (una vez) o actualizar campos editables.
 * displayName solo se puede fijar en el primer guardado.
 */
export async function PATCH(request: Request) {
  try {
    const user = await requireUser();
    const body = (await request.json()) as {
      displayName?: string;
      teamName?: string;
    };
    const { userDoc, memberDoc, userRef, memberRef } = await loadProfile(user.uid);
    const alreadyComplete = Boolean(userDoc.profileCompletedAt && userDoc.displayName);
    const now = Date.now();

    if (!alreadyComplete) {
      const displayName = normalizeDisplayName(body.displayName);
      if (displayName.length < 2) {
        return NextResponse.json(
          { error: "Elige un nombre de al menos 2 caracteres." },
          { status: 400 },
        );
      }
      const teamName = normalizeTeamName(body.teamName);
      await userRef.set(
        {
          displayName,
          teamName,
          profileCompletedAt: now,
          updatedAt: now,
        },
        { merge: true },
      );
      if (memberDoc) {
        await memberRef.set({ displayName, teamName: teamName || null }, { merge: true });
      }
      return NextResponse.json({
        ok: true,
        profileComplete: true,
        displayName,
        teamName: teamName || null,
      });
    }

    // Ya completado: nombre bloqueado; solo equipo fantasy editable.
    if (body.displayName != null && normalizeDisplayName(body.displayName) !== normalizeDisplayName(userDoc.displayName)) {
      return NextResponse.json(
        { error: "El nombre de manager no se puede cambiar durante la liga." },
        { status: 400 },
      );
    }
    const teamName = normalizeTeamName(body.teamName);
    await userRef.set({ teamName, updatedAt: now }, { merge: true });
    if (memberDoc) {
      await memberRef.set({ teamName: teamName || null }, { merge: true });
    }
    return NextResponse.json({
      ok: true,
      profileComplete: true,
      displayName: normalizeDisplayName(userDoc.displayName),
      teamName: teamName || null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ERROR";
    return NextResponse.json({ error: message }, { status: message === "UNAUTHENTICATED" ? 401 : 500 });
  }
}
