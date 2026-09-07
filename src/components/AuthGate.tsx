"use client";

import { useEffect, useState } from "react";
import { firebaseConfigured } from "@/lib/firebase-client";
import { loginGoogle, watchAuth } from "@/lib/session";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const configured = firebaseConfigured();

  useEffect(() => {
    if (!configured) {
      setReady(true);
      return;
    }
    return watchAuth((user) => {
      setSignedIn(Boolean(user));
      setReady(true);
    });
  }, [configured]);

  async function onLogin() {
    setBusy(true);
    setError("");
    try {
      await loginGoogle();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo iniciar sesión");
    } finally {
      setBusy(false);
    }
  }

  if (!ready) {
    return <p className="px-4 py-10 text-sm text-white/60">Cargando…</p>;
  }
  if (!configured) {
    return (
      <div className="px-4 py-10">
        <h2 className="text-lg font-semibold">Falta Firebase Auth</h2>
        <p className="mt-2 text-sm text-white/70">
          El proyecto GCP es <code>fantasy-507821</code>. Hay que activar Authentication (Google) y pegar
          las claves web en <code>.env.local</code>.
        </p>
      </div>
    );
  }
  if (!signedIn) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
        <p className="text-[11px] uppercase tracking-[0.25em] text-gold">LaLiga · 8 managers</p>
        <h2 className="mt-3 text-3xl font-semibold">FANTASY</h2>
        <p className="mt-3 max-w-sm text-sm text-white/70">
          Liga privada modo Normal: mercado diario, jugadores exclusivos, puntos por estadísticas al
          finalizar cada partido.
        </p>
        <button
          disabled={busy}
          onClick={onLogin}
          className="mt-8 rounded-full bg-white px-6 py-3 text-sm font-medium text-ink disabled:opacity-60"
        >
          {busy ? "Abriendo Google…" : "Entrar con Google"}
        </button>
        {error && <p className="mt-4 max-w-sm text-left text-xs text-red-400">{error}</p>}
      </div>
    );
  }
  return <>{children}</>;
}
