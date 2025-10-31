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
    if (!("Notification" in window)) {
      setNotifStatus("unsupported");
      return;
    }
    try {
      const perm = await Notification.requestPermission();
      setNotifStatus(perm);
      if (perm === "granted" && "serviceWorker" in navigator) {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg?.showNotification) {
          reg.showNotification("Notificaciones activadas", {
            body: "Recibirás avisos con sonido.",
            icon: "/icons/icon-192.png",
            badge: "/icons/icon-192.png",
          });
        } else {
          new Notification("Notificaciones activadas", { body: "Listo." });
        }
      }
    } catch {}
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
