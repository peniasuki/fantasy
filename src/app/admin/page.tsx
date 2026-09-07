"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";

type AdminStatus = {
  hasLeague: boolean;
  isAdmin: boolean;
  role: string | null;
  adminEmail: string;
};

export default function AdminPage() {
  const [msg, setMsg] = useState("");
  const [status, setStatus] = useState<AdminStatus | null>(null);

  useEffect(() => {
    api<AdminStatus>("/api/admin/status")
      .then(setStatus)
      .catch((e) => setMsg(e instanceof Error ? e.message : "Error"));
  }, []);

  async function run(path: string) {
    setMsg("Ejecutando…");
    try {
      const res = await api<Record<string, unknown>>(path, { method: "POST" });
      setMsg(JSON.stringify(res, null, 2));
    } catch (error) {
      setMsg(error instanceof Error ? error.message : "Error");
    }
  }

  if (status && !status.isAdmin) {
    return (
      <div className="space-y-3 pb-6">
        <h2 className="text-lg font-semibold">Admin</h2>
        <p className="rounded-lg border border-red-500/40 bg-panel px-3 py-2 text-sm text-red-300">
          Esta sección es solo para el administrador ({status.adminEmail}). Tú eres manager.
        </p>
        <Link href="/" className="inline-block text-sm text-gold underline">
          Volver a la liga
        </Link>
      </div>
    );
  }

  const canRun = status?.isAdmin;

  return (
    <div className="space-y-3 pb-6">
      <h2 className="text-lg font-semibold">Admin</h2>
      <p className="text-sm text-white/60">
        Herramientas del administrador. El seed de plantillas hay que lanzarlo por tandas (Free = 100 req/día).
        Prueba de catálogo con temporada <span className="text-gold">2024</span> (plan Free).
      </p>
      {status && !status.hasLeague && (
        <p className="rounded-lg border border-gold/30 bg-panel px-3 py-2 text-sm text-gold/90">
          Aún no hay liga. Puedes importar plantillas ahora, o{" "}
          <Link href="/" className="underline">
            crear la liga
          </Link>{" "}
          primero.
        </p>
      )}
      <button
        disabled={canRun === false}
        className="w-full rounded-lg border border-line py-3 disabled:opacity-40"
        onClick={() => run("/api/jobs/seed-catalog?maxTeams=5")}
      >
        Importar plantillas (5 equipos)
      </button>
      <button
        disabled={canRun === false}
        className="w-full rounded-lg border border-line py-3 disabled:opacity-40"
        onClick={() => run("/api/jobs/sync-fixtures")}
      >
        Sincronizar calendario
      </button>
      <button
        disabled={canRun === false}
        className="w-full rounded-lg border border-line py-3 disabled:opacity-40"
        onClick={() => run("/api/jobs/settle-market")}
      >
        Cerrar mercado ahora
      </button>
      <button
        disabled={canRun === false}
        className="w-full rounded-lg border border-line py-3 disabled:opacity-40"
        onClick={() => run("/api/jobs/ingest-match")}
      >
        Puntuar partidos FT
      </button>
      {msg && <pre className="whitespace-pre-wrap rounded-lg bg-panel p-3 text-xs text-white/70">{msg}</pre>}
    </div>
  );
}
