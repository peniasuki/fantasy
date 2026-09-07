"use client";

import { useState } from "react";
import { api } from "@/lib/api";

export default function AdminPage() {
  const [msg, setMsg] = useState("");

  async function run(path: string) {
    setMsg("Ejecutando…");
    try {
      const res = await api<Record<string, unknown>>(path, { method: "POST" });
      setMsg(JSON.stringify(res));
    } catch (error) {
      setMsg(error instanceof Error ? error.message : "Error");
    }
  }

  return (
    <div className="space-y-3 pb-6">
      <h2 className="text-lg font-semibold">Admin</h2>
      <p className="text-sm text-white/60">
        Solo el creador de la liga. El seed de plantillas hay que lanzarlo por tandas (Free = 100 req/día).
      </p>
      <button className="w-full rounded-lg border border-line py-3" onClick={() => run("/api/jobs/seed-catalog?maxTeams=5")}>
        Importar plantillas (5 equipos)
      </button>
      <button className="w-full rounded-lg border border-line py-3" onClick={() => run("/api/jobs/sync-fixtures")}>
        Sincronizar calendario
      </button>
      <button className="w-full rounded-lg border border-line py-3" onClick={() => run("/api/jobs/settle-market")}>
        Cerrar mercado ahora
      </button>
      <button className="w-full rounded-lg border border-line py-3" onClick={() => run("/api/jobs/ingest-match")}>
        Puntuar partidos FT
      </button>
      {msg && <pre className="whitespace-pre-wrap rounded-lg bg-panel p-3 text-xs text-white/70">{msg}</pre>}
    </div>
  );
}
