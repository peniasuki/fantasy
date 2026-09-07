"use client";

import { FORMATIONS, formatMoney, type FormationId } from "fantasy-rules";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

type Player = {
  id: string;
  name: string;
  position: "GK" | "DF" | "MF" | "FW";
  vm: number;
  teamName: string;
};

export default function EquipoPage() {
  const [formation, setFormation] = useState<FormationId>("4-3-3");
  const [slots, setSlots] = useState<{ slot: number; position: string; playerId: string | null }[]>([]);
  const [squad, setSquad] = useState<{ playerId: string; player: Player }[]>([]);
  const [locked, setLocked] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    api<{
      squad: { playerId: string; player: Player }[];
      lineup: { formation: FormationId; slots: { slot: number; position: string; playerId: string | null }[] };
      locked: boolean;
    }>("/api/squad")
      .then((res) => {
        setSquad(res.squad);
        setFormation(res.lineup.formation);
        setSlots(res.lineup.slots);
        setLocked(res.locked);
      })
      .catch((e) => setMsg(e.message));
  }, []);

  function assign(slot: number, playerId: string) {
    setSlots((current) => current.map((s) => (s.slot === slot ? { ...s, playerId } : s)));
  }

  return (
    <div className="space-y-4 pb-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Alineación</h2>
        <select
          disabled={locked}
          value={formation}
          onChange={(e) => setFormation(e.target.value as FormationId)}
          className="rounded-lg border border-line bg-panel px-2 py-1 text-sm"
        >
          {Object.keys(FORMATIONS).map((id) => (
            <option key={id}>{id}</option>
          ))}
        </select>
      </div>
      {locked && <p className="text-xs text-gold">Bloqueada: la jornada ya ha empezado.</p>}
      <div className="rounded-2xl bg-gradient-to-b from-grass/40 to-grass/10 p-3">
        {slots.map((slot) => (
          <label key={slot.slot} className="mb-2 block rounded-lg bg-black/30 px-2 py-2 text-sm">
            <span className="mr-2 text-white/50">{slot.position}</span>
            <select
              disabled={locked}
              value={slot.playerId ?? ""}
              onChange={(e) => assign(slot.slot, e.target.value)}
              className="w-[70%] bg-transparent"
            >
              <option value="">—</option>
              {squad
                .filter((s) => s.player?.position === slot.position)
                .map((s) => (
                  <option key={s.playerId} value={s.playerId}>
                    {s.player?.name}
                  </option>
                ))}
            </select>
          </label>
        ))}
      </div>
      <button
        disabled={locked}
        className="w-full rounded-lg bg-grass py-3 disabled:opacity-40"
        onClick={() =>
          api("/api/squad", {
            method: "PUT",
            body: JSON.stringify({ formation, slots }),
          })
            .then(() => setMsg("Alineación guardada"))
            .catch((e) => setMsg(e.message))
        }
      >
        Guardar once
      </button>
      {msg && <p className="text-sm text-white/70">{msg}</p>}
      <h3 className="text-sm uppercase tracking-wide text-white/50">Plantilla</h3>
      <ul className="space-y-2">
        {squad.map((s) => (
          <li key={s.playerId} className="rounded-xl border border-line bg-panel px-3 py-2 text-sm">
            <div className="flex justify-between">
              <span>
                {s.player?.name} · {s.player?.position}
              </span>
              <span className="text-gold">{formatMoney(s.player?.vm ?? 0)}</span>
            </div>
            <p className="text-xs text-white/50">{s.player?.teamName}</p>
            <button
              className="mt-2 text-xs text-gold"
              onClick={() =>
                api("/api/market", {
                  method: "POST",
                  body: JSON.stringify({ action: "list", playerId: s.playerId }),
                })
                  .then(() => setMsg("En venta (cláusula = VM)"))
                  .catch((e) => setMsg(e.message))
              }
            >
              Poner en venta
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
