"use client";

import { createContext, useContext, useEffect, useState } from "react";
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
};

const MeContext = createContext<Me | null>(null);

export function MeProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    api<Me>("/api/me")
      .then(setMe)
      .catch(() => setMe(null));
  }, []);

  return <MeContext.Provider value={me}>{children}</MeContext.Provider>;
}

export function useMe() {
  return useContext(MeContext);
}
