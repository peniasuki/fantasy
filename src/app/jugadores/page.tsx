"use client";

import { formatMoney } from "fantasy-rules";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useVisibleWindow } from "@/lib/use-visible-window";

type Player = {
  id: string;
  name: string;
  position: string;
  teamName: string;
  vm: number;
  ownerId: string | null;
  ownerName?: string | null;
  pointsHome?: number;
  pointsAway?: number;
  pointsTotal?: number;
};

type SortMode = "vm-desc" | "vm-asc" | "points-desc" | "points-asc";
type OwnFilter = "ALL" | "free" | "owned";

function foldText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase();
}

export default function JugadoresPage() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [pos, setPos] = useState("ALL");
  const [team, setTeam] = useState("ALL");
  const [own, setOwn] = useState<OwnFilter>("ALL");
  const [sort, setSort] = useState<SortMode>("vm-desc");

  useEffect(() => {
    api<{ players: Player[] }>("/api/players")
      .then((res) => setPlayers(res.players))
      .catch((e) => setError(e instanceof Error ? e.message : "Error"));
  }, []);

  const teams = useMemo(() => {
    const names = [...new Set(players.map((p) => p.teamName).filter(Boolean))];
    names.sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));
    return names;
  }, [players]);

  const filtered = useMemo(() => {
    const needle = foldText(q.trim());
    const list = players.filter((p) => {
      if (pos !== "ALL" && p.position !== pos) return false;
      if (team !== "ALL" && p.teamName !== team) return false;
      const owned = Boolean(p.ownerId);
      if (own === "free" && owned) return false;
      if (own === "owned" && !owned) return false;
      if (needle && !foldText(p.name).includes(needle)) return false;
      return true;
    });
    list.sort((a, b) => {
      if (sort === "points-desc" || sort === "points-asc") {
        const diff = (a.pointsTotal ?? 0) - (b.pointsTotal ?? 0);
        if (diff !== 0) return sort === "points-asc" ? diff : -diff;
        return (b.vm ?? 0) - (a.vm ?? 0);
      }
      const diff = (a.vm ?? 0) - (b.vm ?? 0);
      if (diff !== 0) return sort === "vm-asc" ? diff : -diff;
      return (b.pointsTotal ?? 0) - (a.pointsTotal ?? 0);
    });
    return list;
  }, [players, q, pos, team, own, sort]);

  const resetKey = `${q}|${pos}|${team}|${own}|${sort}`;
  const { visibleCount, sentinelRef, hasMore } = useVisibleWindow(filtered.length, resetKey);

  return (
    <div className="space-y-3 pb-6">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar jugador"
        className="w-full rounded-lg border border-line bg-panel px-3 py-2"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
      />

      <div className="grid grid-cols-2 gap-2">
        <label className="block text-[11px] uppercase tracking-wide text-white/45">
          Equipo
          <select
            value={team}
            onChange={(e) => setTeam(e.target.value)}
            className="mt-1 w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm text-white"
          >
            <option value="ALL">Todos</option>
            {teams.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-[11px] uppercase tracking-wide text-white/45">
          Orden
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortMode)}
            className="mt-1 w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm text-white"
          >
            <option value="vm-desc">VM · mayor → menor</option>
            <option value="vm-asc">VM · menor → mayor</option>
            <option value="points-desc">Puntos acumulados · mayor → menor</option>
            <option value="points-asc">Puntos acumulados · menor → mayor</option>
          </select>
        </label>
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        {["ALL", "GK", "DF", "MF", "FW"].map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPos(p)}
            className={`rounded-md px-3 py-1 ${pos === p ? "bg-gold text-ink" : "border border-line text-white/70"}`}
          >
            {p === "ALL" ? "Todas" : p}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 text-xs">
        {(
          [
            ["ALL", "Todos"],
            ["free", "Libres"],
            ["owned", "Fichados"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setOwn(value)}
            className={`rounded-md px-3 py-1 ${own === value ? "bg-gold text-ink" : "border border-line text-white/70"}`}
          >
            {label}
          </button>
        ))}
      </div>

      <p className="text-xs text-white/45">
        {filtered.length === 0
          ? "0 jugadores"
          : hasMore
            ? `Mostrando ${visibleCount} de ${filtered.length}`
            : `${filtered.length} jugador${filtered.length === 1 ? "" : "es"}`}
      </p>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <ul className="space-y-2">
        {filtered.slice(0, visibleCount).map((p) => {
          const owned = Boolean(p.ownerId);
          return (
          <li key={p.id} className="rounded-xl border border-line bg-panel px-3 py-2 text-sm">
            <div className="flex justify-between gap-3">
              <span>
                {p.name} · {p.position}
              </span>
              <span className="shrink-0 text-gold">{formatMoney(p.vm)}</span>
            </div>
            <p className="text-xs text-white/50">
              {p.teamName} ·{" "}
              <span className={`font-semibold uppercase ${owned ? "text-red-400" : "text-grass"}`}>
                {owned ? "Fichado" : "Libre"}
              </span>
              {owned && p.ownerName ? (
                <>
                  {" "}
                  · <span className="text-red-300">{p.ownerName}</span>
                </>
              ) : null}
            </p>
            <p className="mt-1 text-xs text-white/70">
              Casa {p.pointsHome ?? 0} · Fuera {p.pointsAway ?? 0} ·{" "}
              <span className="text-gold">Total {p.pointsTotal ?? 0}</span>
            </p>
          </li>
          );
        })}
        {!error && filtered.length === 0 && (
          <li className="text-sm text-white/50">Ningún jugador coincide con el filtro.</li>
        )}
      </ul>
      {hasMore && <div ref={sentinelRef} className="h-8" aria-hidden />}
      {hasMore && <p className="text-center text-xs text-white/40">Desliza para ver más…</p>}
    </div>
  );
}
