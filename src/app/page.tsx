"use client";

import { useEffect, useState } from "react";
import { BrandLogo } from "@/components/BrandLogo";
import { useMe } from "@/components/MeProvider";
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
  const me = useMe();
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
        <div className="flex flex-col items-center gap-3 py-2 text-center sm:py-4">
          <BrandLogo size="welcome" href={null} />
          {me?.isAdmin ? (
            <p className="max-w-xs text-sm text-white/65">Eres el administrador. Crea la liga e invita a los managers.</p>
          ) : (
            <p className="max-w-xs text-sm text-white/65">
              Eres manager. Cuando el admin cree la liga, únete con el código de invitación.
            </p>
          )}
        </div>
        {me?.isAdmin ? (
          <>
            <h2 className="text-lg font-semibold">Crea la liga</h2>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-line bg-panel px-3 py-2"
            />
            <button
              className="w-full rounded-lg bg-grass py-3 font-medium"
              onClick={() =>
                api("/api/league", { method: "POST", body: JSON.stringify({ action: "create", name }) })
                  .then(load)
                  .catch((e) => setError(e.message))
              }
            >
              Crear liga
            </button>
          </>
        ) : (
          <p className="rounded-lg border border-line bg-panel px-3 py-3 text-sm text-white/70">
            Esperando a que el administrador cree la liga. Luego te pasará el código.
          </p>
        )}
      </div>
    );
  }

  if (!data.member) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-white/70">Hay una liga creada. Introduce el código de invitación.</p>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="w-full rounded-lg border border-line bg-panel px-3 py-2 uppercase"
        />
        <button
          className="w-full rounded-lg bg-grass py-3"
          onClick={() =>
            api("/api/league", { method: "POST", body: JSON.stringify({ action: "join", inviteCode: code }) })
              .then(load)
              .catch((e) => setError(e.message))
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
        {me?.isAdmin && (
          <p className="mt-1 text-sm text-white/60">
            Código de invitación: <span className="text-gold">{data.league.inviteCode}</span>
          </p>
        )}
        <p className="mt-2 text-sm">
          Tu saldo {formatMoney(data.member.balance)} · {data.member.points} pts
          {me?.isAdmin ? " · Admin" : " · Manager"}
        </p>
      </section>
      <section>
        <h3 className="mb-2 text-sm uppercase tracking-wide text-white/50">Clasificación</h3>
        <ol className="space-y-2">
          {data.members.map((m, i) => (
            <li key={m.uid} className="flex items-center justify-between rounded-xl border border-line bg-panel px-3 py-2">
              <span>
                {i + 1}. {m.displayName}
                {m.role === "admin" ? " ★" : ""}
              </span>
              <span className="text-gold">{m.points} pts</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
