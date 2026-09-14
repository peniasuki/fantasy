"use client";

import {
  FORMATIONS,
  emptyLineup,
  formatMoney,
  type FormationId,
  type Position,
} from "fantasy-rules";
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
  acquiredVia?: string | null;
  sellLockedUntil?: number | null;
  sellLocked?: boolean;
  player: Player;
};

type Rival = { uid: string; displayName: string };

type SlotRow = {
  slot: number;
  position: string;
  playerId: string | null;
  clauseFillable?: boolean;
};

function playerAlignable(p?: Player | null): boolean {
  if (!p) return false;
  if (p.alignable === false) return false;
  if (p.injured || p.suspended) return false;
  return true;
}

/** Reconstruye huecos al cambiar formación; reasigna jugadores que aún encajan. */
function remapSlotsForFormation(formation: FormationId, previous: SlotRow[]): SlotRow[] {
  const next = emptyLineup(formation);
  const pool = previous
    .filter((s) => s.playerId)
    .map((s) => ({ position: s.position as Position, playerId: s.playerId as string }));
  for (const slot of next) {
    const idx = pool.findIndex((p) => p.position === slot.position);
    if (idx >= 0) {
      slot.playerId = pool[idx].playerId;
      pool.splice(idx, 1);
    }
  }
  return next;
}

function formatLockAt(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return iso;
  return new Intl.DateTimeFormat("es-ES", {
    timeZone: "Europe/Madrid",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(ms));
}

function formatSellLockUntil(ms: number): string {
  return new Intl.DateTimeFormat("es-ES", {
    timeZone: "Europe/Madrid",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(ms));
}

export default function EquipoPage() {
  const [formation, setFormation] = useState<FormationId>("4-3-3");
  const [slots, setSlots] = useState<SlotRow[]>([]);
  const [squad, setSquad] = useState<SquadRow[]>([]);
  const [rivals, setRivals] = useState<Rival[]>([]);
  const [locked, setLocked] = useState(false);
  const [lockAt, setLockAt] = useState<string | null>(null);
  const [lockMatchday, setLockMatchday] = useState<number | null>(null);
  const [autoLock, setAutoLock] = useState(false);
  const [msg, setMsg] = useState("");
  const [sellMsg, setSellMsg] = useState("");
  const [sellBusy, setSellBusy] = useState(false);
  const [sellPlayerId, setSellPlayerId] = useState<string | null>(null);
  const [offerTo, setOfferTo] = useState("");
  const [offerAmount, setOfferAmount] = useState("");

  async function load() {
    const res = await api<{
      squad: SquadRow[];
      rivals: Rival[];
      lineup: { formation: FormationId; slots: SlotRow[] };
      locked: boolean;
      lockAt: string | null;
      lockMatchday: number | null;
      autoLock?: boolean;
    }>("/api/squad");
    setSquad(res.squad);
    setRivals(res.rivals ?? []);
    setFormation(res.lineup.formation);
    setSlots(res.lineup.slots);
    setLocked(res.locked);
    setLockAt(res.lockAt ?? null);
    setLockMatchday(res.lockMatchday ?? null);
    setAutoLock(Boolean(res.autoLock));
  }

  useEffect(() => {
    load().catch((e) => setMsg(e.message));
  }, []);

  function changeFormation(next: FormationId) {
    setFormation(next);
    setSlots((current) => remapSlotsForFormation(next, current));
  }

  function assign(slot: number, playerId: string) {
    setSlots((current) =>
      current.map((s) => {
        if (s.slot !== slot) return s;
        if (locked) {
          if (!s.clauseFillable) return s;
          return { ...s, playerId: playerId || null };
        }
        return { ...s, playerId: playerId || null, clauseFillable: undefined };
      }),
    );
  }

  const canSaveLineup = !locked || slots.some((s) => s.clauseFillable);

  async function afterSale(message: string) {
    setSellMsg("");
    setMsg(message);
    setSellPlayerId(null);
    setOfferTo("");
    setOfferAmount("");
    setSellBusy(false);
    await load();
  }

  async function runSell(
    playerId: string,
    action: () => Promise<{ message?: string }>,
    fallback: string,
  ) {
    setSellBusy(true);
    setSellMsg("");
    try {
      const res = await action();
      await afterSale(res.message ?? fallback);
    } catch (e) {
      setSellBusy(false);
      setSellMsg(e instanceof Error ? e.message : "Error");
    }
  }

  return (
    <div className="space-y-4 pb-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Alineación</h2>
        <select
          disabled={locked}
          value={formation}
          onChange={(e) => changeFormation(e.target.value as FormationId)}
          className="rounded-lg border border-line bg-panel px-2 py-1 text-sm"
        >
          {Object.keys(FORMATIONS).map((id) => (
            <option key={id}>{id}</option>
          ))}
        </select>
      </div>
      {locked ? (
        <p className="text-xs text-gold">
          Alineación bloqueada
          {lockMatchday != null ? ` · Jornada ${lockMatchday}` : ""}
          {lockAt ? ` · desde ${formatLockAt(lockAt)}` : ""}.
          Se reabre al puntuar esa jornada.
          {slots.some((s) => s.clauseFillable) ? (
            <>
              {" "}
              Excepción: puedes cubrir el hueco de un{" "}
              <span className="text-white">clausulazo</span> con un suplente.
            </>
          ) : null}
        </p>
      ) : autoLock && lockAt ? (
        <p className="text-xs text-white/60">
          Alineación abierta
          {lockMatchday != null ? ` · próxima J${lockMatchday}` : ""}. Cierre programado:{" "}
          <span className="text-gold">{formatLockAt(lockAt)}</span> (Madrid)
        </p>
      ) : (
        <p className="text-xs text-white/60">
          Alineación abierta
          {lockMatchday != null ? ` · próxima J${lockMatchday}` : ""}. Cierre manual desde Admin.
        </p>
      )}
      <p className="text-xs text-white/50">
        Hueco vacío = −4 puntos. Lesionados y sancionados no se pueden alinear. Un jugador solo en un
        hueco. Si no cambias el once, se mantiene para las siguientes jornadas.
      </p>
      <div className="rounded-2xl bg-gradient-to-b from-grass/40 to-grass/10 p-3">
        {slots.map((slot) => {
          const slotEditable = !locked || Boolean(slot.clauseFillable);
          return (
          <label key={`${formation}-${slot.slot}`} className="mb-2 block rounded-lg bg-black/30 px-2 py-2 text-sm">
            <span className="mr-2 text-white/50">{slot.position}</span>
            {slot.clauseFillable && locked ? (
              <span className="mr-2 text-xs text-gold">clausulazo</span>
            ) : null}
            <select
              disabled={!slotEditable}
              value={slot.playerId ?? ""}
              onChange={(e) => assign(slot.slot, e.target.value)}
              className="w-[70%] bg-transparent disabled:opacity-50"
            >
              <option value="">— (−4 pts)</option>
              {squad
                .filter((s) => {
                  if (s.player?.position !== slot.position) return false;
                  const usedElsewhere = slots.some(
                    (other) => other.slot !== slot.slot && other.playerId === s.playerId,
                  );
                  return !usedElsewhere;
                })
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
          );
        })}
      </div>
      <button
        disabled={!canSaveLineup}
        className="w-full rounded-lg bg-grass py-3 disabled:opacity-40"
        onClick={() =>
          api<{ message?: string }>("/api/squad", {
            method: "PUT",
            body: JSON.stringify({ formation, slots }),
          })
            .then(async (res) => {
              setMsg(res.message ?? "Alineación guardada");
              await load();
            })
            .catch((e) => setMsg(e.message))
        }
      >
        {locked ? "Cubrir hueco de clausulazo" : "Guardar once"}
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
              {s.sellLocked && s.sellLockedUntil ? (
                <p className="mt-1 text-xs text-gold/90">
                  Protección clausulazo hasta {formatSellLockUntil(s.sellLockedUntil)}
                </p>
              ) : null}
              <button
                type="button"
                disabled={Boolean(s.sellLocked)}
                className={`mt-2 rounded-md px-3 py-1.5 text-sm font-semibold disabled:opacity-40 ${
                  open
                    ? "border border-line text-white/70"
                    : "bg-grass text-ink shadow-sm shadow-black/30"
                }`}
                onClick={() => {
                  if (s.sellLocked) return;
                  setSellMsg("");
                  setSellPlayerId(open ? null : s.playerId);
                }}
              >
                {s.sellLocked ? "Venta bloqueada" : open ? "Cerrar venta" : "Vender"}
              </button>
              {open && (
                <div className="mt-3 space-y-3 border-t border-line pt-3">
                  {sellMsg && <p className="text-sm text-red-300">{sellMsg}</p>}
                  <button
                    type="button"
                    disabled={sellBusy}
                    className="w-full rounded-lg border border-gold/40 bg-gold/10 px-3 py-3 text-left text-xs active:scale-[0.99] disabled:opacity-50"
                    onClick={() => {
                      const ok = window.confirm(
                        `¿Poner a ${s.player?.name} en Oferta Mercado?\n\nRecompra automática al cierre (75–100% del último fichaje). Nadie puede pujar.`,
                      );
                      if (!ok) return;
                      void runSell(
                        s.playerId,
                        () =>
                          api<{ message?: string }>("/api/market", {
                            method: "POST",
                            body: JSON.stringify({ action: "list_to_market", playerId: s.playerId }),
                          }),
                        "En venta al mercado (cierre 00:00).",
                      );
                    }}
                  >
                    <span className="font-medium text-gold">1. Oferta Mercado</span>
                    <span className="mt-0.5 block text-white/55">
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
                      disabled={sellBusy}
                      className="mt-2 rounded-md bg-grass px-3 py-1.5 text-ink disabled:opacity-50"
                      onClick={() =>
                        void runSell(
                          s.playerId,
                          () =>
                            api<{ message?: string }>("/api/market", {
                              method: "POST",
                              body: JSON.stringify({
                                action: "offer",
                                playerId: s.playerId,
                                toId: offerTo,
                                amount: Number(offerAmount),
                              }),
                            }),
                          "Oferta enviada (caduca en 7 días).",
                        )
                      }
                    >
                      Enviar oferta
                    </button>
                  </div>

                  <button
                    type="button"
                    disabled={sellBusy}
                    className="w-full rounded-lg border border-line px-3 py-3 text-left text-xs active:scale-[0.99] disabled:opacity-50"
                    onClick={() => {
                      if (
                        !window.confirm(
                          `¿Venta inmediata por ${formatMoney(instant)} (60% del último fichaje)?`,
                        )
                      ) {
                        return;
                      }
                      void runSell(
                        s.playerId,
                        () =>
                          api<{ message?: string }>("/api/market", {
                            method: "POST",
                            body: JSON.stringify({ action: "instant_sell", playerId: s.playerId }),
                          }),
                        "Venta inmediata hecha.",
                      );
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
