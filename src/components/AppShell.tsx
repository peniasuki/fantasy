"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AuthGate } from "./AuthGate";
import { BrandLogo } from "./BrandLogo";
import { MeProvider, useMe } from "./MeProvider";

const TABS = [
  { href: "/", label: "Liga" },
  { href: "/equipo", label: "Equipo" },
  { href: "/mercado", label: "Mercado" },
  { href: "/jornada", label: "Jornada" },
  { href: "/jugadores", label: "Jugadores" },
];

function ShellInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const me = useMe();

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col pb-[calc(4.5rem+env(safe-area-inset-bottom))]">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-line/70 bg-ink/90 px-4 py-2.5 backdrop-blur-md supports-[backdrop-filter]:bg-ink/75">
        <BrandLogo size="header" />
        <div className="min-w-0 flex-1">
          <p className="text-[10px] uppercase tracking-[0.22em] text-gold">
            {me?.isAdmin ? "Administrador" : "Liga privada"}
          </p>
          <p className="truncate text-base font-semibold leading-tight tracking-wide sm:text-lg">Fantasy Bros</p>
        </div>
        {me?.isAdmin ? (
          <Link
            href="/admin"
            className="shrink-0 rounded-md px-2 py-1 text-xs text-gold/90 transition hover:bg-white/5 hover:text-gold"
          >
            Admin
          </Link>
        ) : me ? (
          <span className="shrink-0 rounded-md px-2 py-1 text-[10px] uppercase tracking-wide text-white/45">Manager</span>
        ) : null}
      </header>
      <main className="flex-1 px-4 py-4">{children}</main>
      <nav className="fixed bottom-0 left-0 right-0 border-t border-line bg-ink/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <div className="mx-auto grid max-w-lg grid-cols-5">
          {TABS.map((tab) => {
            const active = pathname === tab.href;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`px-1 py-3 text-center text-[11px] leading-tight sm:text-xs ${
                  active ? "font-medium text-gold" : "text-white/55"
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate>
      <MeProvider>
        <ShellInner>{children}</ShellInner>
      </MeProvider>
    </AuthGate>
  );
}
