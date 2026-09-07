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
        Producto en <span className="text-gold">fantasy-bros.online</span> · temporada actual vía Jornada Perfecta.
        El entorno <code className="text-white/80">2024.*</code> queda solo para pruebas API-Football Free.
      </p>

      <button
        disabled={canRun === false}
        className="w-full rounded-lg bg-grass py-3 font-medium disabled:opacity-40"
        onClick={() => run("/api/jobs/seed-jp-catalog?openMarket=1")}
      >
        Importar catálogo JP + abrir mercado (todos libres)
      </button>
      <button
        disabled={canRun === false}
        className="w-full rounded-lg border border-line py-3 disabled:opacity-40"
        onClick={() => run("/api/jobs/settle-market")}
      >
        Cerrar / sincronizar mercado
      </button>
      <button
        disabled={canRun === false}
        className="w-full rounded-lg border border-line py-3 disabled:opacity-40"
        onClick={() => run("/api/jobs/sync-fixtures")}
      >
        Sincronizar calendario (API-Football)
      </button>
      <button
        disabled={canRun === false}
        className="w-full rounded-lg border border-line py-3 disabled:opacity-40"
        onClick={() => run("/api/jobs/ingest-match")}
      >
        Puntuar partidos FT
      </button>
      <button
        disabled={canRun === false}
        className="w-full rounded-lg border border-line py-3 text-white/50 disabled:opacity-40"
        onClick={() => run("/api/jobs/seed-catalog?maxTeams=3")}
      >
        [Prueba 2024] Importar plantillas API-Football
      </button>
      {msg && <pre className="whitespace-pre-wrap rounded-lg bg-panel p-3 text-xs text-white/70">{msg}</pre>}
    </div>
  );
}
