"use client";

import { formatMoney } from "fantasy-rules";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useVisibleWindow } from "@/lib/use-visible-window";

type Listing = {
  id: string;
  kind: string;
  askPrice: number;
  expiresAt: number;
  minBid: number;
  maxBid: number;
  bidable?: boolean;
  sellerId?: string;
  player: { name: string; position: string; vm: number; teamName: string };
  myBid: { amount: number } | null;
};

type Offer = {
  id: string;
  playerId: string;
  fromId: string;
  toId: string;
  price: number;
  expiresAt: number;
  expired?: boolean;
  fromName?: string;
  toName?: string;
  player?: { name: string; position: string; vm: number; teamName: string } | null;
};

const CET = "Europe/Madrid";

function formatCet(ms: number, withDate = true): string {
  return new Intl.DateTimeFormat("es-ES", {
    timeZone: CET,
    ...(withDate ? { weekday: "short", day: "numeric", month: "short" } : {}),
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(ms));
}

function foldText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase();
}

function kindLabel(kind: string): string {
  if (kind === "to_market") return "Mercado";
  if (kind === "sale") return "Venta";
  return "Libre";
}

export default function MercadoPage() {
  const [data, setData] = useState<{
    listings: Listing[];
    incomingOffers: Offer[];
    outgoingOffers: Offer[];
    closeAt: number;
    balance: number;
    maxBid: number;
    minPurchaseOfVm: number;
    maxPurchaseOfVm: number;
    salesStartedToday: number;
    maxSalesPerDay: number;
  } | null>(null);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [q, setQ] = useState("");
  const [pos, setPos] = useState("ALL");
  const [team, setTeam] = useState("ALL");

  async function load() {
    const res = await api<{
      listings: Listing[];
      incomingOffers: Offer[];
      outgoingOffers: Offer[];
      closeAt: number;
      balance: number;
      maxBid: number;
      minPurchaseOfVm: number;
      maxPurchaseOfVm: number;
      salesStartedToday: number;
      maxSalesPerDay: number;
    }>("/api/market");
    setData(res);
  }

  useEffect(() => {
    load().catch((e) => setMsg(e.message));
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const teams = useMemo(() => {
    if (!data) return [];
    const names = [
      ...new Set(data.listings.map((l) => l.player?.teamName).filter(Boolean) as string[]),
    ];
    names.sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));
    return names;
  }, [data]);

  const listings = useMemo(() => {
    if (!data) return [];
    const needle = foldText(q.trim());
    return data.listings
      .filter((listing) => {
        const player = listing.player;
        if (!player) return false;
        if (pos !== "ALL" && player.position !== pos) return false;
        if (team !== "ALL" && player.teamName !== team) return false;
        if (needle && !foldText(player.name).includes(needle)) return false;
        return true;
      })
      .sort((a, b) => {
        // Ventas a máquina arriba del resto filtrado; luego por VM.
        if (a.kind === "to_market" && b.kind !== "to_market") return -1;
        if (b.kind === "to_market" && a.kind !== "to_market") return 1;
        return (b.player?.vm ?? 0) - (a.player?.vm ?? 0);
      });
  }, [data, q, pos, team]);

  const resetKey = `${q}|${pos}|${team}`;
  const { visibleCount, sentinelRef, hasMore } = useVisibleWindow(listings.length, resetKey);

  if (!data) return <p className="text-sm text-white/60">{msg || "Cargando mercado…"}</p>;

  const minPct = Math.round((data.minPurchaseOfVm ?? 0.75) * 100);
  const maxPct = Math.round((data.maxPurchaseOfVm ?? 1.5) * 100);
  const incoming = (data.incomingOffers ?? []).filter((o) => !o.expired);
  const outgoing = data.outgoingOffers ?? [];

  return (
    <div className="space-y-4 pb-6">
      <section className="rounded-2xl border border-line bg-panel p-4">
        <p className="text-sm text-white/60">Hora CET {formatCet(now, false)}</p>
        <p className="mt-1 text-sm text-white/60">Cierre {formatCet(data.closeAt)} CET</p>
        <p className="mt-2">
          Saldo {formatMoney(data.balance)} · tope cartera {formatMoney(data.maxBid)}
        </p>
        <p className="mt-1 text-xs text-white/45">
          Pujas {minPct}–{maxPct}% del VM · {data.listings.length} en mercado · ventas hoy{" "}
          {data.salesStartedToday ?? 0}/{data.maxSalesPerDay ?? 3}
        </p>
      </section>

      {incoming.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gold">Ofertas recibidas</h2>
          {incoming.map((offer) => (
            <article key={offer.id} className="rounded-2xl border border-gold/40 bg-panel p-4">
              <div className="flex justify-between gap-3">
                <h3 className="font-medium">{offer.player?.name ?? offer.playerId}</h3>
                <span className="shrink-0 text-gold">{formatMoney(offer.price)}</span>
              </div>
              <p className="text-sm text-white/60">
                De {offer.fromName ?? offer.fromId}
                {offer.player?.teamName ? ` · ${offer.player.teamName}` : ""}
              </p>
              <p className="mt-1 text-xs text-white/45">Caduca {formatCet(offer.expiresAt)}</p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  className="rounded-lg bg-grass px-3 py-2 text-sm text-ink"
                  onClick={() =>
                    api("/api/market", {
                      method: "POST",
                      body: JSON.stringify({ action: "accept_offer", offerId: offer.id }),
                    })
                      .then(() => {
                        setMsg("Oferta aceptada");
                        load();
                      })
                      .catch((e) => setMsg(e.message))
                  }
                >
                  Aceptar
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-line px-3 py-2 text-sm"
                  onClick={() =>
                    api("/api/market", {
                      method: "POST",
                      body: JSON.stringify({ action: "reject_offer", offerId: offer.id }),
                    })
                      .then(() => {
                        setMsg("Oferta rechazada");
                        load();
                      })
                      .catch((e) => setMsg(e.message))
                  }
                >
                  Rechazar
                </button>
              </div>
            </article>
          ))}
        </section>
      )}

      {outgoing.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-white/50">Ofertas enviadas</h2>
          {outgoing.map((offer) => (
            <article key={offer.id} className="rounded-xl border border-line bg-panel/80 px-3 py-2 text-sm">
              <div className="flex justify-between gap-2">
                <span>
                  {offer.player?.name ?? offer.playerId} → {offer.toName ?? offer.toId}
                </span>
                <span className="text-gold">{formatMoney(offer.price)}</span>
              </div>
              <div className="mt-1 flex items-center justify-between gap-2 text-xs text-white/45">
                <span>Caduca {formatCet(offer.expiresAt)}</span>
                <button
                  type="button"
                  className="text-gold"
                  onClick={() =>
                    api("/api/market", {
                      method: "POST",
                      body: JSON.stringify({ action: "cancel_offer", offerId: offer.id }),
                    })
                      .then(() => {
                        setMsg("Oferta cancelada");
                        load();
                      })
                      .catch((e) => setMsg(e.message))
                  }
                >
                  Cancelar
                </button>
              </div>
            </article>
          ))}
        </section>
      )}

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar en mercado"
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
        <div className="flex flex-wrap content-end gap-2 text-xs">
          {["ALL", "GK", "DF", "MF", "FW"].map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPos(p)}
              className={`rounded-md px-2.5 py-1 ${pos === p ? "bg-gold text-ink" : "border border-line text-white/70"}`}
            >
              {p === "ALL" ? "Todas" : p}
            </button>
          ))}
        </div>
      </div>
      <p className="text-xs text-white/45">
        {listings.length === 0
          ? "0 resultados"
          : hasMore
            ? `Mostrando ${visibleCount} de ${listings.length}`
            : `${listings.length} resultado${listings.length === 1 ? "" : "s"}`}
      </p>

      {listings.slice(0, visibleCount).map((listing) => {
        const bidable = listing.bidable !== false && listing.kind !== "to_market";
        return (
          <article key={listing.id} className="rounded-2xl border border-line bg-panel p-4">
            <div className="flex justify-between gap-3">
              <h3 className="font-medium">{listing.player?.name}</h3>
              <span className="shrink-0 text-xs uppercase text-gold">{kindLabel(listing.kind)}</span>
            </div>
            <p className="text-sm text-white/60">
              {listing.player?.position} · {listing.player?.teamName} · VM{" "}
              {formatMoney(listing.player?.vm ?? 0)}
            </p>
            {listing.kind === "to_market" ? (
              <p className="mt-2 text-xs text-white/50">
                En venta al mercado. Recompra automática al cierre (75–100% del último fichaje). No se
                puede pujar.
              </p>
            ) : (
              <>
                <p className="mt-1 text-xs text-white/45">
                  Mín {formatMoney(listing.minBid)} · Máx {formatMoney(listing.maxBid)}
                </p>
                {listing.myBid && (
                  <p className="text-xs text-grass">Tu puja: {formatMoney(listing.myBid.amount)}</p>
                )}
                {bidable && (
                  <div className="mt-3 flex gap-2">
                    <input
                      inputMode="numeric"
                      placeholder={`Mín ${listing.minBid}`}
                      value={amounts[listing.id] ?? ""}
                      onChange={(e) => setAmounts({ ...amounts, [listing.id]: e.target.value })}
                      className="flex-1 rounded-lg border border-line bg-ink px-3 py-2 text-sm"
                    />
                    <button
                      className="rounded-lg bg-grass px-3 text-sm"
                      onClick={() =>
                        api("/api/market", {
                          method: "POST",
                          body: JSON.stringify({
                            action: "bid",
                            listingId: listing.id,
                            amount: Number(amounts[listing.id]),
                          }),
                        })
                          .then(() => {
                            setMsg("Puja guardada (ciega hasta el cierre)");
                            load();
                          })
                          .catch((e) => setMsg(e.message))
                      }
                    >
                      Pujar
                    </button>
                  </div>
                )}
              </>
            )}
          </article>
        );
      })}
      {hasMore && <div ref={sentinelRef} className="h-8" aria-hidden />}
      {hasMore && <p className="text-center text-xs text-white/40">Desliza para ver más…</p>}
      {listings.length === 0 && (
        <p className="text-sm text-white/50">Ningún listado coincide con el filtro.</p>
      )}
      {msg && <p className="text-sm text-white/70">{msg}</p>}
    </div>
  );
}
