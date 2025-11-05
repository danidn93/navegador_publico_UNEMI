"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext"; 
import { supabase } from "@/integrations/supabase/client"; 
import { toast } from "sonner"; 

const VAPID_PUBLIC_KEY="BGDC3SN4UrXYkmSpjcc0solx7T97gTYdqd4c13yMqz3hdZxWvhkX18ubZOb5RSmeIiJTzbMejViW5VmqpV7CVD4";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onRestartWatch?: () => void;
};

export default function PermissionsCenter({ open, onOpenChange, onRestartWatch }: Props) {
  const [geoStatus, setGeoStatus] =
    useState<PermissionState | "unsupported" | "unknown">("unknown");
  const [notifStatus, setNotifStatus] =
    useState<NotificationPermission | "unsupported">("default");
  const audioCtxRef = useRef<AudioContext | null>(null);

  const { user } = useAuth();

  useEffect(() => {
    (async () => {
      if (!("permissions" in navigator)) {
        setGeoStatus("unsupported");
        return;
      }
      try {
        // @ts-ignore
        const g: PermissionStatus = await navigator.permissions.query({ name: "geolocation" as any });
        setGeoStatus(g.state);
        g.onchange = () => setGeoStatus(g.state);
      } catch {
        setGeoStatus("unknown");
      }
    })();

    if (!("Notification" in window)) setNotifStatus("unsupported");
    else setNotifStatus(Notification.permission);
  }, []);

  const requestGeolocation = () => {
    if (!("geolocation" in navigator)) {
      setGeoStatus("unsupported");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      () => {
        setGeoStatus("granted");
        onRestartWatch?.();
      },
      () => setGeoStatus("denied"),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  };

  const requestNotifications = async () => {
    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      setNotifStatus("unsupported");
      toast.error("Las notificaciones Push no son compatibles con este navegador.");
      return;
    }

    try {
      // 1. Pedir permiso (Tu código)
      const perm = await Notification.requestPermission();
      setNotifStatus(perm);

      if (perm === "granted") {
        console.log("Permiso de notificación concedido. Suscribiendo...");
        
        // 2. Obtener el registro del Service Worker
        const reg = await navigator.serviceWorker.ready;

        // 3. ¡NUEVO! Suscribir al Push Manager
        const subscription = await reg.pushManager.subscribe({
          userVisibleOnly: true, // Requerido
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });

        console.log("Suscripción Push obtenida:", subscription);

        // 4. ¡NUEVO! Guardar la suscripción en Supabase
        if (!user?.id) {
          toast.error("No se pudo identificar al usuario. Inicia sesión de nuevo.");
          return;
        }

        // Asumo que tu tabla de usuarios (ej. 'app_users' o 'profiles')
        // tiene una columna llamada 'push_subscription' de tipo JSONB.
        const { error } = await supabase
          .from("app_users") // <-- CAMBIA ESTO por tu tabla de usuarios
          .update({ push_subscription: subscription })
          .eq("id", user.id); // <-- Asegúrate que 'user.id' sea el ID de la tabla

        if (error) {
          console.error("Error al guardar la suscripción:", error);
          toast.error("Error al guardar la suscripción en la base de datos.");
          return; // No continuar si falla
        }

        // 5. Notificación de prueba (Tu código)
        toast.success("¡Notificaciones Push activadas!");
        reg.showNotification("Notificaciones activadas", {
          body: "Recibirás avisos en este dispositivo.",
          icon: "/icons/icon-192.png",
          badge: "/icons/icon-192.png",
        });

      } else {
        // El usuario denegó el permiso
        toast.warning("Permiso de notificaciones denegado.");
      }
    } catch (err) {
      console.error("Error al suscribir a notificaciones Push:", err);
      toast.error("No se pudieron activar las notificaciones.");
    }
  };

  const playTestSound = async () => {
    try {
      const Ctx: any = (window as any).AudioContext || (window as any).webkitAudioContext;
      const ctx: AudioContext = (audioCtxRef.current ||= new Ctx());
      if (ctx.state === "suspended") await ctx.resume();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.02);
      osc.start();
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.4);
      osc.stop(ctx.currentTime + 0.42);
    } catch {}
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Permisos y sensores</DialogTitle>
          <DialogDescription>
            Activa GPS y notificaciones con sonido para una mejor experiencia.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <section className="rounded-md border p-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">Ubicación (GPS)</div>
                <div className="text-xs text-muted-foreground">
                  Estado: <b className="capitalize">{String(geoStatus)}</b>
                </div>
              </div>
              <Button size="sm" onClick={requestGeolocation}>Permitir</Button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Si ves “denied”, habilítalo en Ajustes del navegador/Sistema y vuelve a presionar “Permitir”.
            </p>
          </section>

          <section className="rounded-md border p-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">Notificaciones</div>
                <div className="text-xs text-muted-foreground">
                  Estado: <b className="capitalize">{String(notifStatus)}</b>
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={playTestSound}>Probar sonido</Button>
                <Button size="sm" onClick={requestNotifications}>Permitir</Button>
              </div>
            </div>
          </section>
        </div>

        <DialogFooter className="pt-2">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
