"use client";

import { formatMoney } from "fantasy-rules";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

type Listing = {
  id: string;
  kind: string;
  askPrice: number;
  expiresAt: number;
  player: { name: string; position: string; vm: number; teamName: string };
  myBid: { amount: number } | null;
};

export default function MercadoPage() {
  const [data, setData] = useState<{
    listings: Listing[];
    closeAt: number;
    balance: number;
    maxBid: number;
  } | null>(null);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState("");

  async function load() {
    const res = await api<{ listings: Listing[]; closeAt: number; balance: number; maxBid: number }>("/api/market");
    setData(res);
  }

  useEffect(() => {
    load().catch((e) => setMsg(e.message));
  }, []);

  if (!data) return <p className="text-sm text-white/60">{msg || "Cargando mercado…"}</p>;
  const hours = Math.max(0, Math.round((data.closeAt - Date.now()) / 36e5));

  return (
    <div className="space-y-4 pb-6">
      <section className="rounded-2xl border border-line bg-panel p-4">
        <p className="text-sm text-white/60">Cierre ~ {hours}h (07:00 Madrid)</p>
        <p className="mt-1">
          Saldo {formatMoney(data.balance)} · puja máx. {formatMoney(data.maxBid)}
        </p>
      </section>
      {data.listings.map((listing) => (
        <article key={listing.id} className="rounded-2xl border border-line bg-panel p-4">
          <div className="flex justify-between">
            <h3 className="font-medium">{listing.player?.name}</h3>
            <span className="text-xs uppercase text-gold">{listing.kind === "sale" ? "Venta" : "Libre"}</span>
          </div>
          <p className="text-sm text-white/60">
            {listing.player?.position} · {listing.player?.teamName} · VM {formatMoney(listing.player?.vm ?? 0)}
          </p>
          {listing.myBid && <p className="text-xs text-grass">Tu puja: {formatMoney(listing.myBid.amount)}</p>}
          <div className="mt-3 flex gap-2">
            <input
              inputMode="numeric"
              placeholder="Puja"
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
                    setMsg("Puja guardada (ciega hasta las 07:00)");
                    load();
                  })
                  .catch((e) => setMsg(e.message))
              }
            >
              Pujar
            </button>
          </div>
        </article>
      ))}
      {msg && <p className="text-sm text-white/70">{msg}</p>}
    </div>
  );
}
