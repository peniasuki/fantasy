"use client";

import { useEffect, useState } from "react";
import { BrandLogo } from "@/components/BrandLogo";
import { api } from "@/lib/api";
import { firebaseConfigured } from "@/lib/firebase-client";
import { loginGoogle, watchAuth } from "@/lib/session";

type MePreview = { appRole: "admin" | "manager"; name: string | null; email: string | null };

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [welcome, setWelcome] = useState<MePreview | null>(null);
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

  useEffect(() => {
    if (!signedIn) {
      setWelcome(null);
      return;
    }
    let cancelled = false;
    api<MePreview>("/api/me")
      .then((me) => {
        if (!cancelled) setWelcome(me);
      })
      .catch(() => {
        if (!cancelled) setWelcome(null);
      });
    return () => {
      cancelled = true;
    };
  }, [signedIn]);

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
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center px-4">
        <BrandLogo size="compact" href={null} className="opacity-70" />
        <p className="mt-4 text-sm text-white/60">Cargando…</p>
      </div>
    );
  }
  if (!configured) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-4 py-10">
        <BrandLogo size="header" href={null} />
        <h2 className="mt-4 text-lg font-semibold">Falta Firebase Auth</h2>
        <p className="mt-2 text-sm text-white/70">
          El proyecto GCP es <code>fantasy-507821</code>. Hay que activar Authentication (Google) y pegar
          las claves web en <code>.env.local</code>.
        </p>
      </div>
    );
  }
  if (!signedIn) {
    return (
      <div className="relative flex min-h-dvh flex-col overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_18%,rgba(228,197,107,0.14),transparent_55%),radial-gradient(ellipse_at_80%_0%,rgba(180,40,40,0.18),transparent_45%),linear-gradient(180deg,#0a0e14_0%,#07090d_55%,#05070a_100%)]"
        />
        <div className="relative z-10 mx-auto flex w-full max-w-lg flex-1 flex-col items-center px-5 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(2.5rem,env(safe-area-inset-top))] text-center sm:px-8">
          <div className="flex flex-1 flex-col items-center justify-center">
            <BrandLogo size="hero" href={null} />
            <p className="mt-6 max-w-[18rem] text-sm leading-relaxed text-white/70 sm:max-w-sm sm:text-[0.95rem]">
              Liga privada entre amigos. Entra con Google: el administrador gestiona la liga; el resto juega como
              manager.
            </p>
            <button
              disabled={busy}
              onClick={onLogin}
              className="mt-8 w-full max-w-xs rounded-xl bg-white px-6 py-3.5 text-sm font-semibold text-ink transition active:scale-[0.98] disabled:opacity-60 sm:w-auto sm:min-w-[14rem]"
            >
              {busy ? "Abriendo Google…" : "Entrar con Google"}
            </button>
            {error && <p className="mt-4 max-w-sm text-left text-xs text-red-400">{error}</p>}
          </div>
        </div>
      </div>
    );
  }

  // Breve discriminacion de perfil tras login mientras carga el shell
  if (!welcome) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center px-4 text-center">
        <BrandLogo size="compact" href={null} />
        <p className="mt-4 text-sm text-white/60">Identificando perfil…</p>
      </div>
    );
  }

  return <>{children}</>;
}
