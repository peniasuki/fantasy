"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

type Fixture = {
  id: string;
  status: string;
  round: string;
  timestamp: number;
  home: { name: string; logo: string };
  away: { name: string; logo: string };
  goals: { home: number | null; away: number | null };
};

export default function JornadaPage() {
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ fixtures: Fixture[] }>("/api/jornada")
      .then((res) => setFixtures(res.fixtures))
      .catch((e) => setError(e.message));
  }, []);

  const rounds = Array.from(new Set(fixtures.map((f) => f.round)));
  const current = rounds.find((r) => fixtures.some((f) => f.round === r && f.status !== "FT")) || rounds.at(-1);

  return (
    <div className="space-y-3 pb-6">
      <h2 className="text-lg font-semibold">{current || "Jornada"}</h2>
      <p className="text-xs text-white/50">Puntos al finalizar cada partido. No hay marcador en vivo.</p>
      {error && <p className="text-sm text-red-400">{error}</p>}
      {fixtures
        .filter((f) => f.round === current)
        .map((f) => (
          <article key={f.id} className="rounded-2xl border border-line bg-panel p-4">
            <div className="flex items-center justify-between text-sm">
              <span>{f.home.name}</span>
              <span className="text-gold">
                {f.status === "FT" || f.status === "AET" || f.status === "PEN"
                  ? `${f.goals.home ?? 0}–${f.goals.away ?? 0}`
                  : "Pendiente"}
              </span>
              <span>{f.away.name}</span>
            </div>
            <p className="mt-1 text-xs text-white/45">
              {new Date(f.timestamp * 1000).toLocaleString("es-ES")} · {f.status}
            </p>
          </article>
        ))}
    </div>
  );
}
