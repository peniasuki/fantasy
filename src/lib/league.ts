import { DEFAULT_SETTINGS, type LeagueSettings } from "fantasy-rules";
import { db } from "./firebase-admin";
import { isAdminEmail } from "./roles";

export const LEAGUE_ID = "main";

export type Member = {
  uid: string;
  role: "admin" | "manager";
  displayName: string;
  picture: string | null;
  balance: number;
  points: number;
  joinedAt: number;
};

export async function getLeague(): Promise<Record<string, unknown> | null> {
  const snap = await db().collection("leagues").doc(LEAGUE_ID).get();
  return snap.exists ? (snap.data() as Record<string, unknown>) : null;
}

export async function requireMember(uid: string) {
  const snap = await db().collection("leagues").doc(LEAGUE_ID).collection("members").doc(uid).get();
  if (!snap.exists) throw new Error("NOT_A_MEMBER");
  return snap.data() as Member;
}

export async function isAdmin(uid: string): Promise<boolean> {
  const userSnap = await db().collection("users").doc(uid).get();
  return isAdminEmail(String(userSnap.data()?.email || ""));
}

export function settingsOf(league: Record<string, unknown> | null | undefined): LeagueSettings {
  return { ...DEFAULT_SETTINGS, ...((league?.settings as LeagueSettings) ?? {}) };
}
