// src/contexts/AuthContext.tsx
"use client";

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { supabase, supabaseFx } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { RealtimeChannel } from "@supabase/supabase-js";

export type AppRole = "public" | "student" | "admin";

type Ctx = {
  user: { id: string; usuario: string } | null;
  appUserId: number | null;
  role: AppRole;
  loading: boolean;
  refreshRole: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<Ctx>({
  user: null,
  appUserId: null,
  role: "public",
  loading: true,
  refreshRole: async () => {},
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<Ctx["user"]>(null);
  const [appUserId, setAppUserId] = useState<number | null>(null);
  const [role, setRole] = useState<AppRole>("public");
  const [loading, setLoading] = useState(true);
  const channelRef = useRef<RealtimeChannel | null>(null);

  const loadSessionAndRole = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const u = session?.user ?? null;
      setUser(u ? { id: u.id, usuario: u.email ?? "" } : null);

      if (u?.email) {
        console.log("[Auth] RPC get_app_role →");
        const { data, error } = await supabaseFx.rpc("get_app_role", { p_email: u.email });
        if (error) {
          console.error("get_app_role error:", error);
          setRole("public");
        } else {
          setRole((data as AppRole) ?? "public");
        }
        const { data: appUserData, error: appUserError } = await supabase
          .from("app_users") // Tu tabla de usuarios
          .select("id")     // El 'id' numérico (bigint)
          .eq("usuario", u.email) // Busca por el email
          .single();
        
        if (appUserError) {
          console.error("Error fetching app_user id:", appUserError);
          setAppUserId(null);
        } else {
          setAppUserId(appUserData.id); // ¡Guarda el ID numérico!
        }
      } else {
        setRole("public");
        setAppUserId(null);
      }
    } catch (e) {
      console.error(e);
      setRole("public");
      setAppUserId(null);
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

  useEffect(() => {
    // Función de limpieza para desuscribirse
    const cleanup = () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
        console.log("[Auth] Realtime desconectado.");
      }
    };

    // Si el usuario no está logueado, o su rol es 'public',
    // nos aseguramos de estar desuscritos y no hacemos nada más.
    if (!user || role === 'public') {
      cleanup();
      return;
    }

    // Si llegamos aquí, el usuario está logueado con un rol (admin/student)
    // Limpiamos cualquier canal anterior (por si el rol cambió)
    cleanup();

    // Creamos un nuevo canal único para este usuario/rol
    const channel = supabase.channel(`notifications_for_${role}_${user.id}`);

    let realtimeFilter: string;

    if (role === 'admin') {
      // El Admin escucha notificaciones para admin, student, Y public
      realtimeFilter = 'role_target=in.("admin","student","public")';
    } else if (role === 'student') {
      // El Estudiante escucha notificaciones para student Y public
      realtimeFilter = 'role_target=in.("student","public")';
    } else {
      // Si por alguna razón es otro rol, solo escucha public
      realtimeFilter = 'role_target=eq.public';
    }

    channel
      .on(
        'postgres_changes',
        {
          event: 'INSERT', // Escuchar solo inserciones
          schema: 'public',
          table: 'notifications',
          // Filtramos para que solo nos lleguen notificaciones
          // que coincidan con el ROL del usuario logueado.
          filter: realtimeFilter,
        },
        (payload) => {
          console.log('Nueva notificación recibida:', payload);
          const newNotif = payload.new as any; // (Tipar esto sería ideal)

          // Extraemos los datos de la notificación
          const message = newNotif.reason || 'Tienes una nueva notificación';
          const severity = newNotif.severity || 'info';

          // ¡Usamos Sonner para mostrar el toast!
          switch (severity) {
            case 'success':
              toast.success(message);
              break;
            case 'error':
              toast.error(message);
              break;
            case 'warning':
              toast.warning(message);
              break;
            default:
              toast.info(message);
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log(`[Auth] Realtime suscrito a notificaciones para: ${role}`);
        } else if (status === 'CHANNEL_ERROR') {
          console.error('[Auth] Realtime error de canal.');
        }
      });

    // Guardamos el canal en la referencia para poder limpiarlo después
    channelRef.current = channel;

    // La función de limpieza se ejecutará cuando el componente
    // se desmonte o cuando las dependencias (role, user) cambien.
    return () => {
      cleanup();
    };
  }, [role, user]); // Dependencias: se ejecuta cuando 'role' o 'user' cambian

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
    setAppUserId(null);
    setRole("public");
    toast.message("Sesión cerrada");
  }, []);

  return (
    <AuthContext.Provider value={{ user, appUserId, role, loading, refreshRole, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
