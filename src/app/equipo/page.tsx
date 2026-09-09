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
  injured?: boolean;
  suspended?: boolean;
  alignable?: boolean;
  availabilityStatus?: string | null;
};

type SquadRow = {
  playerId: string;
  buyPrice: number;
  boughtAt: number;
  player: Player;
};

type Rival = { uid: string; displayName: string };

function playerAlignable(p?: Player | null): boolean {
  if (!p) return false;
  if (p.alignable === false) return false;
  if (p.injured || p.suspended) return false;
  return true;
}

export default function EquipoPage() {
  const [formation, setFormation] = useState<FormationId>("4-3-3");
  const [slots, setSlots] = useState<{ slot: number; position: string; playerId: string | null }[]>([]);
  const [squad, setSquad] = useState<SquadRow[]>([]);
  const [rivals, setRivals] = useState<Rival[]>([]);
  const [locked, setLocked] = useState(false);
  const [msg, setMsg] = useState("");
  const [sellPlayerId, setSellPlayerId] = useState<string | null>(null);
  const [offerTo, setOfferTo] = useState("");
  const [offerAmount, setOfferAmount] = useState("");

  async function load() {
    const res = await api<{
      squad: SquadRow[];
      rivals: Rival[];
      lineup: { formation: FormationId; slots: { slot: number; position: string; playerId: string | null }[] };
      locked: boolean;
    }>("/api/squad");
    setSquad(res.squad);
    setRivals(res.rivals ?? []);
    setFormation(res.lineup.formation);
    setSlots(res.lineup.slots);
    setLocked(res.locked);
  }

  useEffect(() => {
    load().catch((e) => setMsg(e.message));
  }, []);

  function assign(slot: number, playerId: string) {
    setSlots((current) =>
      current.map((s) => (s.slot === slot ? { ...s, playerId: playerId || null } : s)),
    );
  }

  async function afterSale(message: string) {
    setMsg(message);
    setSellPlayerId(null);
    setOfferTo("");
    setOfferAmount("");
    await load();
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
      {locked && (
        <p className="text-xs text-gold">
          Bloqueada: ha pasado el cierre de la próxima jornada a puntuar.
        </p>
      )}
      <p className="text-xs text-white/50">
        Hueco vacío = 0 puntos. Lesionados y sancionados no se pueden alinear.
      </p>
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
              <option value="">— (0 pts)</option>
              {squad
                .filter((s) => s.player?.position === slot.position)
                .map((s) => {
                  const ok = playerAlignable(s.player);
                  return (
                    <option key={s.playerId} value={s.playerId} disabled={!ok}>
                      {s.player?.name}
                      {!ok
                        ? s.player?.suspended
                          ? " (sancionado)"
                          : " (lesionado)"
                        : ""}
                    </option>
                  );
                })}
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
        {squad.map((s) => {
          const last = s.buyPrice > 0 ? s.buyPrice : 0;
          const instant = last > 0 ? Math.max(1, Math.round(last * 0.6)) : 0;
          const open = sellPlayerId === s.playerId;
          return (
            <li key={s.playerId} className="rounded-xl border border-line bg-panel px-3 py-2 text-sm">
              <div className="flex justify-between gap-2">
                <span>
                  {s.player?.name} · {s.player?.position}
                  {!playerAlignable(s.player) && (
                    <span className="ml-2 text-xs text-red-300">
                      {s.player?.suspended ? "Sancionado" : "Lesionado"}
                    </span>
                  )}
                </span>
              </div>
              <p className="mt-1 text-xs text-white/55">
                {s.player?.teamName}
                {s.player?.availabilityStatus && s.player.availabilityStatus !== "Disponible"
                  ? ` · ${s.player.availabilityStatus}`
                  : ""}
              </p>
              <p className="mt-1 text-xs text-white/70">
                VM <span className="text-gold">{formatMoney(s.player?.vm ?? 0)}</span>
                {" · "}
                Último fichaje{" "}
                <span className="text-gold">{last > 0 ? formatMoney(last) : "—"}</span>
              </p>
              <button
                type="button"
                className={`mt-2 rounded-md px-3 py-1.5 text-sm font-semibold ${
                  open
                    ? "border border-line text-white/70"
                    : "bg-grass text-ink shadow-sm shadow-black/30"
                }`}
                onClick={() => setSellPlayerId(open ? null : s.playerId)}
              >
                {open ? "Cerrar venta" : "Vender"}
              </button>
              {open && (
                <div className="mt-3 space-y-3 border-t border-line pt-3">
                  <button
                    type="button"
                    className="w-full rounded-lg border border-line px-3 py-2 text-left text-xs"
                    onClick={() =>
                      api<{ message?: string }>("/api/market", {
                        method: "POST",
                        body: JSON.stringify({ action: "list_to_market", playerId: s.playerId }),
                      })
                        .then((res) => afterSale(res.message ?? "En venta al mercado (cierre ~07:00)."))
                        .catch((e) => setMsg(e.message))
                    }
                  >
                    <span className="font-medium text-white">1. Oferta Mercado</span>
                    <span className="mt-0.5 block text-white/50">
                      Recompra al cierre (75–100% del último fichaje). Nadie puede pujar.
                    </span>
                  </button>

                  <div className="rounded-lg border border-line px-3 py-2 text-xs">
                    <p className="font-medium text-white">2. Oferta a competidor</p>
                    <p className="mt-0.5 text-white/50">Caduca en 7 días. Sin contraoferta.</p>
                    <select
                      value={offerTo}
                      onChange={(e) => setOfferTo(e.target.value)}
                      className="mt-2 w-full rounded-md border border-line bg-ink px-2 py-1.5"
                    >
                      <option value="">Elegir manager…</option>
                      {rivals.map((r) => (
                        <option key={r.uid} value={r.uid}>
                          {r.displayName}
                        </option>
                      ))}
                    </select>
                    <input
                      inputMode="numeric"
                      placeholder="Precio €"
                      value={offerAmount}
                      onChange={(e) => setOfferAmount(e.target.value)}
                      className="mt-2 w-full rounded-md border border-line bg-ink px-2 py-1.5"
                    />
                    <button
                      type="button"
                      className="mt-2 rounded-md bg-grass px-3 py-1.5 text-ink"
                      onClick={() =>
                        api("/api/market", {
                          method: "POST",
                          body: JSON.stringify({
                            action: "offer",
                            playerId: s.playerId,
                            toId: offerTo,
                            amount: Number(offerAmount),
                          }),
                        })
                          .then(() => afterSale("Oferta enviada (caduca en 7 días)."))
                          .catch((e) => setMsg(e.message))
                      }
                    >
                      Enviar oferta
                    </button>
                  </div>

                  <button
                    type="button"
                    className="w-full rounded-lg border border-line px-3 py-2 text-left text-xs"
                    onClick={() => {
                      if (
                        !window.confirm(
                          `¿Venta inmediata por ${formatMoney(instant)} (60% del último fichaje)?`,
                        )
                      ) {
                        return;
                      }
                      api<{ message?: string }>("/api/market", {
                        method: "POST",
                        body: JSON.stringify({ action: "instant_sell", playerId: s.playerId }),
                      })
                        .then((res) => afterSale(res.message ?? "Venta inmediata hecha."))
                        .catch((e) => setMsg(e.message));
                    }}
                  >
                    <span className="font-medium text-white">3. Venta inmediata</span>
                    <span className="mt-0.5 block text-white/50">
                      Cobras {formatMoney(instant)} ahora. Queda libre a VM.
                    </span>
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
