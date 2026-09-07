"use client";

import { onAuthStateChanged, signInWithPopup, signOut, type User } from "firebase/auth";
import { clientAuth, firebaseConfigured, googleProvider } from "./firebase-client";

let current: User | null = null;

export function watchAuth(cb: (user: User | null) => void) {
  if (!firebaseConfigured()) {
    cb(null);
    return () => undefined;
  }
  return onAuthStateChanged(clientAuth(), (user) => {
    current = user;
    cb(user);
  });
}

export async function loginGoogle() {
  try {
    await signInWithPopup(clientAuth(), googleProvider);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(message);
  }
}

export async function logout() {
  await signOut(clientAuth());
}

export async function getIdToken(): Promise<string | null> {
  if (current) return current.getIdToken();
  if (!firebaseConfigured()) return null;
  const user = clientAuth().currentUser;
  return user ? user.getIdToken() : null;
}
