"use client";

import { formatMoney } from "fantasy-rules";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";

type Player = {
  id: string;
  name: string;
  position: string;
  teamName: string;
  vm: number;
  ownerId: string | null;
};

export default function JugadoresPage() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [q, setQ] = useState("");
  const [pos, setPos] = useState("ALL");

  useEffect(() => {
    api<{ players: Player[] }>("/api/players")
      .then((res) => setPlayers(res.players))
      .catch(() => undefined);
  }, []);

  const filtered = useMemo(
    () =>
      players.filter((p) => {
        if (pos !== "ALL" && p.position !== pos) return false;
        if (q && !p.name.toLowerCase().includes(q.toLowerCase())) return false;
        return true;
      }),
    [players, q, pos],
  );

  return (
    <div className="space-y-3 pb-6">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar jugador"
        className="w-full rounded-lg border border-line bg-panel px-3 py-2"
      />
      <div className="flex gap-2 text-xs">
        {["ALL", "GK", "DF", "MF", "FW"].map((p) => (
          <button
            key={p}
            onClick={() => setPos(p)}
            className={`rounded-full px-3 py-1 ${pos === p ? "bg-gold text-ink" : "border border-line"}`}
          >
            {p}
          </button>
        ))}
      </div>
      <ul className="space-y-2">
        {filtered.slice(0, 80).map((p) => (
          <li key={p.id} className="rounded-xl border border-line bg-panel px-3 py-2 text-sm">
            <div className="flex justify-between">
              <span>
                {p.name} · {p.position}
              </span>
              <span className="text-gold">{formatMoney(p.vm)}</span>
            </div>
            <p className="text-xs text-white/50">
              {p.teamName} · {p.ownerId ? "Fichado" : "Libre"}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
