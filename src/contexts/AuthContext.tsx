// src/contexts/AuthContext.tsx
"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { supabase, supabaseFx } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type AppRole = "public" | "student" | "admin";

type Ctx = {
  user: { id: string; email: string } | null;
  role: AppRole;
  loading: boolean;
  refreshRole: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<Ctx>({
  user: null,
  role: "public",
  loading: true,
  refreshRole: async () => {},
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<Ctx["user"]>(null);
  const [role, setRole] = useState<AppRole>("public");
  const [loading, setLoading] = useState(true);

  const loadSessionAndRole = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const u = session?.user ?? null;
      setUser(u ? { id: u.id, email: u.email ?? "" } : null);

      if (u?.email) {
        console.log("[Auth] RPC get_app_role →");
        const { data, error } = await supabaseFx.rpc("get_app_role", { p_email: u.email });
        if (error) {
          console.error("get_app_role error:", error);
          setRole("public");
        } else {
          setRole((data as AppRole) ?? "public");
        }
      } else {
        setRole("public");
      }
    } catch (e) {
      console.error(e);
      setRole("public");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Restore on mount
    loadSessionAndRole();

    // React to auth changes
    const { data: sub } = supabase.auth.onAuthStateChange((_event, _session) => {
      loadSessionAndRole();
    });

    return () => { sub.subscription.unsubscribe(); };
  }, [loadSessionAndRole]);

  const refreshRole = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    const u = session?.user;
    if (u?.email) {
      const { data, error } = await supabaseFx.rpc("get_app_role", { p_email: u.email });
      if (!error) setRole((data as AppRole) ?? "public");
    }
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    setRole("public");
    toast.message("Sesión cerrada");
  }, []);

  return (
    <AuthContext.Provider value={{ user, role, loading, refreshRole, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
