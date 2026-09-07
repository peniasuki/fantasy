"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { formatMoney } from "fantasy-rules";

type Member = {
  uid: string;
  displayName: string;
  points: number;
  balance: number;
  role: string;
};

export default function LigaPage() {
  const [data, setData] = useState<{
    league: { name: string; inviteCode: string } | null;
    member: Member | null;
    members: Member[];
  } | null>(null);
  const [name, setName] = useState("Liga entre amigos");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const res = await api<{ league: { name: string; inviteCode: string } | null; member: Member | null; members: Member[] }>(
      "/api/league",
    );
    setData(res);
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  if (error) return <p className="text-sm text-red-400">{error}</p>;
  if (!data) return <p className="text-sm text-white/60">Cargando liga…</p>;

  if (!data.league) {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Crea la liga</h2>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-lg border border-line bg-panel px-3 py-2"
        />
        <button
          className="w-full rounded-lg bg-grass py-3 font-medium"
          onClick={() =>
            api("/api/league", { method: "POST", body: JSON.stringify({ action: "create", name }) }).then(load)
          }
        >
          Crear liga
        </button>
        <p className="text-center text-xs text-white/50">o únete</p>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Código"
          className="w-full rounded-lg border border-line bg-panel px-3 py-2 uppercase"
        />
        <button
          className="w-full rounded-lg border border-line py-3"
          onClick={() =>
            api("/api/league", { method: "POST", body: JSON.stringify({ action: "join", inviteCode: code }) }).then(load)
          }
        >
          Unirme
        </button>
      </div>
    );
  }

  if (!data.member) {
    return (
      <div className="space-y-3">
        <p>Hay una liga creada. Introduce el código.</p>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="w-full rounded-lg border border-line bg-panel px-3 py-2 uppercase"
        />
        <button
          className="w-full rounded-lg bg-grass py-3"
          onClick={() =>
            api("/api/league", { method: "POST", body: JSON.stringify({ action: "join", inviteCode: code }) }).then(load)
          }
        >
          Unirme
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-line bg-panel p-4">
        <h2 className="text-lg font-semibold">{data.league.name}</h2>
        <p className="mt-1 text-sm text-white/60">
          Código de invitación: <span className="text-gold">{data.league.inviteCode}</span>
        </p>
        <p className="mt-2 text-sm">
          Tu saldo {formatMoney(data.member.balance)} · {data.member.points} pts
        </p>
      </section>
      <section>
        <h3 className="mb-2 text-sm uppercase tracking-wide text-white/50">Clasificación</h3>
        <ol className="space-y-2">
          {data.members.map((m, i) => (
            <li key={m.uid} className="flex items-center justify-between rounded-xl border border-line bg-panel px-3 py-2">
              <span>
                {i + 1}. {m.displayName}
              </span>
              <span className="text-gold">{m.points} pts</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
