"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { BrandLogo } from "@/components/BrandLogo";
import { useMeApi } from "@/components/MeProvider";
import { api } from "@/lib/api";

export function ProfileGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { me, loading, refresh } = useMeApi();
  const [displayName, setDisplayName] = useState("");
  const [teamName, setTeamName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!me || me.profileComplete) return;
    setDisplayName(me.displayName || me.name || "");
    setTeamName(me.teamName || "");
  }, [me]);

  if (loading || !me) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center px-4">
        <BrandLogo size="compact" href={null} className="opacity-70" />
        <p className="mt-4 text-sm text-white/60">Cargando perfil…</p>
      </div>
    );
  }

  // Permitir consultar reglas antes de completar el perfil.
  if (me.profileComplete || pathname === "/reglas") {
    return <>{children}</>;
  }

  async function save() {
    setBusy(true);
    setError("");
    try {
      await api("/api/me", {
        method: "PATCH",
        body: JSON.stringify({ displayName, teamName }),
      });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_18%,rgba(228,197,107,0.12),transparent_55%),linear-gradient(180deg,#0a0e14_0%,#07090d_100%)]"
      />
      <div className="relative z-10 mx-auto flex w-full max-w-lg flex-1 flex-col px-5 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(2rem,env(safe-area-inset-top))]">
        <BrandLogo size="header" href={null} />
        <h1 className="mt-6 text-xl font-semibold tracking-wide">Tu perfil de manager</h1>
        <p className="mt-2 text-sm text-white/60">
          Antes de entrar en la liga, elige cómo te verán el resto. El{" "}
          <span className="text-white/80">nombre de manager no se podrá cambiar</span> durante la
          temporada.
        </p>

        <label className="mt-6 block text-[11px] uppercase tracking-wide text-white/45">
          Nombre de manager
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={32}
            placeholder="Ej. Andres"
            className="mt-1 w-full rounded-lg border border-line bg-panel px-3 py-2.5 text-sm text-white"
            autoComplete="nickname"
          />
        </label>

        <label className="mt-4 block text-[11px] uppercase tracking-wide text-white/45">
          Nombre del equipo (opcional)
          <input
            value={teamName}
            onChange={(e) => setTeamName(e.target.value)}
            maxLength={40}
            placeholder="Ej. Los Bros FC"
            className="mt-1 w-full rounded-lg border border-line bg-panel px-3 py-2.5 text-sm text-white"
          />
        </label>

        <p className="mt-3 text-xs text-white/40">Cuenta Google: {me.email || "—"}</p>

        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

        <button
          type="button"
          disabled={busy || displayName.trim().length < 2}
          onClick={() => void save()}
          className="mt-6 w-full rounded-xl bg-grass py-3.5 text-sm font-semibold text-ink disabled:opacity-40"
        >
          {busy ? "Guardando…" : "Entrar a Fantasy Bros"}
        </button>

        <Link
          href="/reglas"
          className="mt-4 text-center text-sm text-gold underline-offset-2 hover:underline"
        >
          Consultar reglas de la liga
        </Link>
      </div>
    </div>
  );
}
