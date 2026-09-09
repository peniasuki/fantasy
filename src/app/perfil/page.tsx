"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useMe, useMeApi } from "@/components/MeProvider";
import { logout } from "@/lib/session";

export default function PerfilPage() {
  const me = useMe();
  const { refresh, setMe } = useMeApi();
  const [teamName, setTeamName] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    if (me) setTeamName(me.teamName ?? "");
  }, [me]);

  if (!me) return <p className="text-sm text-white/60">Cargando…</p>;

  async function saveTeam() {
    setBusy(true);
    setMsg("");
    try {
      await api("/api/me", {
        method: "PATCH",
        body: JSON.stringify({ teamName }),
      });
      await refresh();
      setMsg("Equipo actualizado.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4 pb-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Perfil</h2>
          <p className="mt-1 text-sm text-white/55">Datos visibles en la liga.</p>
        </div>
        <Link href="/" className="text-sm text-gold underline-offset-2 hover:underline">
          Cerrar
        </Link>
      </div>

      <section className="rounded-2xl border border-line bg-panel p-4">
        <div className="flex items-center gap-3">
          {me.picture ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={me.picture}
              alt=""
              className="h-12 w-12 rounded-full border border-line object-cover"
            />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-sm text-white/50">
              {(me.displayName || "?").slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <p className="truncate text-base font-medium text-gold">{me.displayName || "—"}</p>
            <p className="truncate text-xs text-white/45">{me.email}</p>
          </div>
        </div>

        <p className="mt-4 text-[11px] uppercase tracking-wide text-white/45">Nombre de manager</p>
        <p className="mt-1 text-sm text-white">{me.displayName || "—"}</p>
        <p className="mt-1 text-xs text-white/40">No se puede cambiar durante la liga.</p>

        <label className="mt-4 block text-[11px] uppercase tracking-wide text-white/45">
          Nombre del equipo
          <input
            value={teamName}
            onChange={(e) => setTeamName(e.target.value)}
            maxLength={40}
            className="mt-1 w-full rounded-lg border border-line bg-ink px-3 py-2 text-sm"
            placeholder="Opcional"
          />
        </label>
        <button
          type="button"
          disabled={busy}
          onClick={() => void saveTeam()}
          className="mt-3 rounded-lg bg-grass px-3 py-2 text-sm font-medium text-ink disabled:opacity-40"
        >
          {busy ? "Guardando…" : "Guardar equipo"}
        </button>
        {msg && <p className="mt-2 text-sm text-white/65">{msg}</p>}
      </section>

      <p className="text-xs text-white/40">
        Rol: {me.isAdmin ? "Administrador" : "Manager"}
        {me.isMember ? " · Miembro de la liga" : " · Aún no has entrado en la liga"}
      </p>

      <button
        type="button"
        disabled={loggingOut}
        onClick={() => {
          void (async () => {
            setLoggingOut(true);
            setMsg("");
            try {
              await logout();
              setMe(null);
            } catch (e) {
              setMsg(e instanceof Error ? e.message : "No se pudo desconectar");
              setLoggingOut(false);
            }
          })();
        }}
        className="w-full rounded-xl border border-red-500/40 py-3 text-sm font-medium text-red-300 disabled:opacity-40"
      >
        {loggingOut ? "Desconectando…" : "Desconectarse"}
      </button>
    </div>
  );
}
