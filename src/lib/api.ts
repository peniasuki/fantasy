"use client";

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { getIdToken } = await import("./session");
  const token = await getIdToken();
  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.error || `Error ${res.status}`);
  }
  return body as T;
}
