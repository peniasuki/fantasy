"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useMe } from "@/components/MeProvider";

type MatchPlayer = {
  playerId: string;
  name: string;
  position: string;
  points: number;
  venue: "home" | "away";
};

type Match = {
  index: number;
  home: string;
  away: string;
  homeGoals: number | null;
  awayGoals: number | null;
  kickoff: string | null;
  players: MatchPlayer[];
};

type JornadaPayload = {
  matchday: number;
  currentMatchday: number;
  scored: boolean;
  matches: Match[];
  ownership: Record<string, string>;
  members: Record<string, { uid: string; displayName: string }>;
  matchdays: { number: number; name: string; startsOn: string; scored: boolean }[];
  matchdayMeta: { number: number; name: string; startsOn: string; lockAt: string };
};

export default function JornadaPage() {
  const me = useMe();
  const [data, setData] = useState<JornadaPayload | null>(null);
  const [matchday, setMatchday] = useState<number | null>(null);
  const [openMatch, setOpenMatch] = useState<number | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async (md?: number) => {
    setError("");
    const q = md != null ? `?matchday=${md}` : "";
    try {
      const res = await api<JornadaPayload>(`/api/jornada${q}`);
      setData(res);
      setMatchday(res.matchday);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = useMemo(
    () => data?.matches.find((m) => m.index === openMatch) ?? null,
    [data, openMatch],
  );

  function ownerLabel(playerId: string): { mine: boolean; label: string | null } {
    const ownerId = data?.ownership[playerId];
    if (!ownerId) return { mine: false, label: null };
    if (me?.uid && ownerId === me.uid) return { mine: true, label: "Tu plantilla" };
    const name = data?.members[ownerId]?.displayName ?? "Manager";
    return { mine: false, label: name };
  }

  return (
    <div className="space-y-3 pb-6">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Jornada</h2>
          <p className="text-xs text-white/50">Puntos JP · media AS / SofaScore</p>
        </div>
        <label className="block text-[11px] uppercase tracking-wide text-white/45">
          Jornada
          <select
            className="mt-1 block rounded-lg border border-line bg-panel px-2 py-1.5 text-sm text-white"
            value={matchday ?? ""}
            onChange={(e) => {
              const n = Number(e.target.value);
              setOpenMatch(null);
              setMatchday(n);
              void load(n);
            }}
          >
            {(data?.matchdays ?? []).map((m) => (
              <option key={m.number} value={m.number}>
                {m.name}
                {m.scored ? " · puntuada" : ""}
              </option>
            ))}
          </select>
        </label>
      </div>

      {data && (
        <p className="text-xs text-white/45">
          {data.matchdayMeta.startsOn}
          {data.scored ? " · Puntuada" : " · Pendiente de puntuar"}
          {data.matchday === data.currentMatchday ? " · Actual" : ""}
        </p>
      )}
      {error && <p className="text-sm text-red-400">{error}</p>}

      {!selected &&
        (data?.matches ?? []).map((m) => (
          <button
            key={m.index}
            type="button"
            onClick={() => setOpenMatch(m.index)}
            className="w-full rounded-2xl border border-line bg-panel p-4 text-left transition hover:border-gold/50"
          >
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="min-w-0 flex-1 truncate">{m.home}</span>
              <span className="shrink-0 text-gold">
                {m.homeGoals != null && m.awayGoals != null
                  ? `${m.homeGoals}–${m.awayGoals}`
                  : "vs"}
              </span>
              <span className="min-w-0 flex-1 truncate text-right">{m.away}</span>
            </div>
          </button>
        ))}

      {selected && (
        <div className="space-y-3">
          <button
            type="button"
            className="text-sm text-gold underline"
            onClick={() => setOpenMatch(null)}
          >
            ← Volver a la jornada
          </button>
          <article className="rounded-2xl border border-line bg-panel p-4">
            <div className="flex items-center justify-between gap-2 text-sm font-medium">
              <span>{selected.home}</span>
              <span className="text-gold">
                {selected.homeGoals != null && selected.awayGoals != null
                  ? `${selected.homeGoals}–${selected.awayGoals}`
                  : "Pendiente"}
              </span>
              <span>{selected.away}</span>
            </div>
          </article>

          {!data?.scored || selected.players.length === 0 ? (
            <p className="text-sm text-white/55">
              Jornada aún no puntuada: solo se muestran los equipos.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {(["home", "away"] as const).map((venue) => (
                <div key={venue} className="space-y-1">
                  <p className="text-[11px] uppercase tracking-wide text-white/45">
                    {venue === "home" ? selected.home : selected.away}
                  </p>
                  {selected.players
                    .filter((p) => p.venue === venue)
                    .map((p) => {
                      const own = ownerLabel(p.playerId);
                      return (
                        <div
                          key={p.playerId}
                          className={`rounded-lg px-2 py-1.5 text-xs ${
                            own.mine
                              ? "border border-gold/70 bg-gold/10"
                              : own.label
                                ? "border border-white/20 bg-white/5"
                                : "border border-transparent bg-black/20"
                          }`}
                        >
                          <div className="flex justify-between gap-1">
                            <span className="truncate">{p.name}</span>
                            <span className="shrink-0 text-gold">{p.points}</span>
                          </div>
                          {own.label && (
                            <p className={`text-[10px] ${own.mine ? "text-gold" : "text-white/45"}`}>
                              {own.label}
                            </p>
                          )}
                        </div>
                      );
                    })}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
