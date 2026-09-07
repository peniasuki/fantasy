import { headers } from "next/headers";
import { adminAuth, db } from "./firebase-admin";

export type SessionUser = {
  uid: string;
  email: string | null;
  name: string | null;
  picture: string | null;
};

export async function requireUser(): Promise<SessionUser> {
  const headerList = await headers();
  const token = headerList.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("UNAUTHENTICATED");
  const decoded = await adminAuth().verifyIdToken(token);
  await db().collection("users").doc(decoded.uid).set(
    {
      email: decoded.email ?? null,
      name: decoded.name ?? decoded.email ?? "Manager",
      picture: decoded.picture ?? null,
      updatedAt: Date.now(),
    },
    { merge: true },
  );
  return {
    uid: decoded.uid,
    email: decoded.email ?? null,
    name: decoded.name ?? null,
    picture: decoded.picture ?? null,
  };
}

export function jobsAuthorized(request: Request): boolean {
  const secret = process.env.JOBS_SHARED_SECRET;
  const header = request.headers.get("x-jobs-secret");
  const oidc = request.headers.get("x-goog-authenticated-user-email");
  if (secret && header === secret) return true;
  if (oidc) return true;
  return false;
}
