"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AuthGate } from "./AuthGate";
import { BrandLogo } from "./BrandLogo";
import { MeProvider, useMe } from "./MeProvider";
import { ProfileGate } from "./ProfileGate";

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
  const hideChrome = pathname === "/reglas" && !me?.profileComplete;
  const label = me?.displayName || me?.name || "Perfil";

  if (hideChrome) {
    return <main className="mx-auto min-h-dvh w-full max-w-lg px-4 py-4">{children}</main>;
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col pb-[calc(4.5rem+env(safe-area-inset-bottom))]">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-line/70 bg-ink/90 px-4 py-2.5 backdrop-blur-md supports-[backdrop-filter]:bg-ink/75">
        <BrandLogo size="header" />
        <div className="min-w-0 flex-1">
          <p className="text-[10px] uppercase tracking-[0.22em] text-gold">
            {me?.isAdmin ? "Administrador" : "Liga privada"}
          </p>
          <p className="truncate text-base font-semibold leading-tight tracking-wide sm:text-lg">
            Fantasy Bros
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Link
            href="/reglas"
            className="rounded-md px-2 py-1 text-[11px] text-white/55 transition hover:bg-white/5 hover:text-white/80"
          >
            Reglas
          </Link>
          {me?.isAdmin && (
            <Link
              href="/admin"
              className="rounded-md px-2 py-1 text-[11px] text-gold/90 transition hover:bg-white/5 hover:text-gold"
            >
              Admin
            </Link>
          )}
          {me && (
            <Link
              href="/perfil"
              className="max-w-[7.5rem] truncate rounded-md bg-white/5 px-2 py-1 text-xs font-medium text-gold transition hover:bg-white/10"
              title="Ver perfil"
            >
              {label}
            </Link>
          )}
        </div>
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
        <ProfileGate>
          <ShellInner>{children}</ShellInner>
        </ProfileGate>
      </MeProvider>
    </AuthGate>
  );
}
