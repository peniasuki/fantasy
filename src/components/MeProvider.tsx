"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { AppRole } from "@/lib/roles";

export type Me = {
  uid: string;
  email: string | null;
  name: string | null;
  picture: string | null;
  appRole: AppRole;
  isAdmin: boolean;
  adminEmail: string;
  displayName: string | null;
  teamName: string | null;
  profileComplete: boolean;
  profileCompletedAt: number | null;
  isMember: boolean;
};

type MeContextValue = {
  me: Me | null;
  loading: boolean;
  refresh: () => Promise<Me | null>;
  setMe: (me: Me | null) => void;
};

const MeContext = createContext<MeContextValue>({
  me: null,
  loading: true,
  refresh: async () => null,
  setMe: () => undefined,
});

export function MeProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const next = await api<Me>("/api/me");
      setMe(next);
      return next;
    } catch {
      setMe(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <MeContext.Provider value={{ me, loading, refresh, setMe }}>{children}</MeContext.Provider>
  );
}

export function useMe() {
  return useContext(MeContext).me;
}

export function useMeApi() {
  return useContext(MeContext);
}
