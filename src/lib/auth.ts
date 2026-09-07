import { headers } from "next/headers";
import { adminAuth, db } from "./firebase-admin";
import { appRoleFromEmail, isAdminEmail, type AppRole } from "./roles";
import { LEAGUE_ID, type Member } from "./league";

export type SessionUser = {
  uid: string;
  email: string | null;
  name: string | null;
  picture: string | null;
  appRole: AppRole;
};

async function syncLeagueMemberRole(uid: string, email: string | null, appRole: AppRole) {
  const memberRef = db().collection("leagues").doc(LEAGUE_ID).collection("members").doc(uid);
  const snap = await memberRef.get();
  if (!snap.exists) return;
  const member = snap.data() as Member;
  if (member.role !== appRole) {
    await memberRef.set({ role: appRole }, { merge: true });
  }
  // Garantiza un solo admin en la liga: demota a otros con role admin.
  if (appRole === "admin" && email) {
    const members = await db().collection("leagues").doc(LEAGUE_ID).collection("members").get();
    const batch = db().batch();
    let pending = false;
    for (const doc of members.docs) {
      if (doc.id === uid) continue;
      if ((doc.data() as Member).role === "admin") {
        batch.set(doc.ref, { role: "manager" }, { merge: true });
        pending = true;
      }
    }
    if (pending) await batch.commit();
  }
}

export async function requireUser(): Promise<SessionUser> {
  const headerList = await headers();
  const token = headerList.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("UNAUTHENTICATED");
  const decoded = await adminAuth().verifyIdToken(token);
  const email = decoded.email ?? null;
  const appRole = appRoleFromEmail(email);

  await db().collection("users").doc(decoded.uid).set(
    {
      email,
      name: decoded.name ?? decoded.email ?? "Manager",
      picture: decoded.picture ?? null,
      appRole,
      updatedAt: Date.now(),
    },
    { merge: true },
  );

  await syncLeagueMemberRole(decoded.uid, email, appRole);

  return {
    uid: decoded.uid,
    email,
    name: decoded.name ?? null,
    picture: decoded.picture ?? null,
    appRole,
  };
}

export function jobsAuthorized(request: Request): boolean {
  const secret = process.env.JOBS_SHARED_SECRET;
  const header = request.headers.get("x-jobs-secret");
  if (secret && header === secret) return true;
  return false;
}

/** Scheduler secret o administrador (email allowlist). */
export async function requireJobOrAdmin(request: Request): Promise<SessionUser | null> {
  if (jobsAuthorized(request)) return null;
  const user = await requireUser();
  if (!isAdminEmail(user.email)) {
    const err = new Error("Forbidden: solo el administrador puede ejecutar esto.");
    (err as Error & { status: number }).status = 403;
    throw err;
  }
  return user;
}
