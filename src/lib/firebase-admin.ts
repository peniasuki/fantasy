import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

function init() {
  if (getApps().length) return getApps()[0];
  return initializeApp({
    credential: applicationDefault(),
    projectId: process.env.GCP_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  });
}

export function adminApp() {
  return init();
}

export function db() {
  return getFirestore(init());
}

export function adminAuth() {
  return getAuth(init());
}
