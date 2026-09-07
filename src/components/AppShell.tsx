"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AuthGate } from "./AuthGate";

const TABS = [
  { href: "/", label: "Liga" },
  { href: "/equipo", label: "Equipo" },
  { href: "/mercado", label: "Mercado" },
  { href: "/jornada", label: "Jornada" },
  { href: "/jugadores", label: "Jugadores" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <AuthGate>
      <div className="mx-auto flex min-h-dvh max-w-lg flex-col pb-20">
        <header className="flex items-center justify-between px-4 py-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] text-gold">Liga privada</p>
            <h1 className="text-xl font-semibold">FANTASY</h1>
          </div>
          <Link href="/admin" className="text-xs text-white/60">
            Admin
          </Link>
        </header>
        <main className="flex-1 px-4">{children}</main>
        <nav className="fixed bottom-0 left-0 right-0 border-t border-line bg-ink/95 backdrop-blur">
          <div className="mx-auto grid max-w-lg grid-cols-5">
            {TABS.map((tab) => {
              const active = pathname === tab.href;
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={`py-3 text-center text-xs ${active ? "text-gold" : "text-white/55"}`}
                >
                  {tab.label}
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </AuthGate>
  );
}
