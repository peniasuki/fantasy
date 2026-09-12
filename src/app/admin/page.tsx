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

  async function scoreJornada() {
    const raw = window.prompt("Número de jornada a puntuar (1–38):");
    if (raw == null) return;
    const n = Number(raw.trim());
    if (!Number.isInteger(n) || n < 1 || n > 38) {
      setMsg("Número de jornada inválido.");
      return;
    }
    await run(`/api/jobs/score-jornada?matchday=${n}`);
  }

  async function seedFirstFour() {
    setMsg("Re-puntuando jornadas 1–4 (force)…");
    const results: unknown[] = [];
    for (const n of [1, 2, 3, 4]) {
      try {
        const res = await api<Record<string, unknown>>(
          `/api/jobs/score-jornada?matchday=${n}&force=1`,
          { method: "POST" },
        );
        results.push(res);
      } catch (error) {
        results.push({ matchday: n, error: error instanceof Error ? error.message : "Error" });
      }
    }
    setMsg(JSON.stringify(results, null, 2));
  }

  async function resetLeague() {
    const ok = window.confirm(
      "¿Restablecer la liga?\n\n• Todos los jugadores fichados vuelven al mercado (VM)\n• Managers a 40M € y 0 puntos\n• Se borran pujas, ofertas y alineaciones\n\nEsta acción no se puede deshacer.",
    );
    if (!ok) return;
    const typed = window.prompt('Escribe RESTABLECER para confirmar:');
    if (typed !== "RESTABLECER") {
      setMsg("Cancelado: confirmación incorrecta.");
      return;
    }
    await run("/api/jobs/reset-league");
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
        Producto en <span className="text-gold">fantasy-bros.online</span> · puntuación Jornada Perfecta
        (media AS / SofaScore).
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
        onClick={() => run("/api/jobs/seed-calendar")}
      >
        Publicar calendario maestro LaLiga 26/27
      </button>
      <button
        disabled={canRun === false}
        className="w-full rounded-lg border border-line py-3 disabled:opacity-40"
        onClick={() => run("/api/jobs/sync-jp-availability?force=1")}
      >
        Actualizar lesionados / sancionados (JP)
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
        className="w-full rounded-lg border border-gold/50 py-3 text-gold disabled:opacity-40"
        onClick={() => {
          const ok = window.confirm(
            "¿Cerrar alineaciones de la próxima jornada?\n\nNadie podrá cambiar el once hasta que se puntúe esa jornada.",
          );
          if (!ok) return;
          void run("/api/jobs/lock-lineups");
        }}
      >
        Cerrar alineaciones (manual)
      </button>
      <button
        disabled={canRun === false}
        className="w-full rounded-lg border border-gold/50 py-3 text-gold disabled:opacity-40"
        onClick={() => {
          const ok = window.confirm(
            "¿Recalcular saldos?\n\nSaldo = 40M − suma de precios de fichaje (pujas) + primas de jornada.\nÚtil si hubo cobros duplicados.",
          );
          if (!ok) return;
          void run("/api/jobs/reconcile-balances");
        }}
      >
        Recalcular saldos (pujas)
      </button>
      <button
        disabled={canRun === false}
        className="w-full rounded-lg border border-gold/50 py-3 text-gold disabled:opacity-40"
        onClick={() => void scoreJornada()}
      >
        Puntuar jornada (JP)…
      </button>
      <button
        disabled={canRun === false}
        className="w-full rounded-lg border border-line py-3 disabled:opacity-40"
        onClick={() => void seedFirstFour()}
      >
        Popular / corregir puntos jornadas 1–4 (solo catálogo)
      </button>
      <button
        disabled={canRun === false}
        className="w-full rounded-lg border border-gold/50 py-3 text-gold disabled:opacity-40"
        onClick={() => run("/api/jobs/reset-manager-standings")}
      >
        Reiniciar clasificación managers (arranque J5)
      </button>
      <button
        disabled={canRun === false}
        className="w-full rounded-lg border border-red-500/50 py-3 text-red-300 disabled:opacity-40"
        onClick={() => void resetLeague()}
      >
        Restablecer (mercado + 40M)
      </button>
      {msg && <pre className="whitespace-pre-wrap rounded-lg bg-panel p-3 text-xs text-white/70">{msg}</pre>}
    </div>
  );
}
