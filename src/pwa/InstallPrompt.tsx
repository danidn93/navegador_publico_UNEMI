// src/pwa/InstallPrompt.tsx
"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

type DeferredEvt = any;

function isStandalone() {
  // iOS: navigator.standalone; otros: matchMedia
  const iosStandalone = typeof navigator !== "undefined" && (navigator as any).standalone === true;
  const displayStandalone = window.matchMedia("(display-mode: standalone)").matches;
  return iosStandalone || displayStandalone;
}

function isIosSafari() {
  const ua = (navigator.userAgent || "").toLowerCase();
  const isIOS = /iphone|ipad|ipod/.test(ua);
  const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
  return isIOS && isSafari;
}

export default function InstallPrompt() {
  const [deferred, setDeferred] = useState<DeferredEvt | null>(null);
  const [showIosGuide, setShowIosGuide] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (isStandalone()) return;

    const onBeforeInstall = (e: any) => {
      // Android/Chrome
      e.preventDefault();
      setDeferred(e);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);

    // iOS Safari no dispara beforeinstallprompt → mostramos guía
    let t: any;
    if (isIosSafari()) {
      t = setTimeout(() => setShowIosGuide(true), 1200);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      if (t) clearTimeout(t);
    };
  }, []);

  useEffect(() => {
    const onInstalled = () => {
      setDeferred(null);
      setShowIosGuide(false);
    };
    window.addEventListener("appinstalled", onInstalled);
    return () => window.removeEventListener("appinstalled", onInstalled);
  }, []);

  if (isStandalone() || dismissed) return null;

  if (deferred) {
    // Android/Chrome → prompt nativo
    return (
      <div className="fixed bottom-4 right-4 z-[3600]">
        <div className="rounded-lg border bg-white/95 backdrop-blur p-3 shadow-lg">
          <div className="text-sm mb-2 font-medium">Instala la app</div>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={async () => {
                deferred.prompt();
                await deferred.userChoice;
                setDeferred(null);
              }}
            >
              Instalar
            </Button>
            <Button size="sm" variant="outline" onClick={() => setDismissed(true)}>
              Luego
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (showIosGuide) {
    // iOS Safari → guía A2HS
    return (
      <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 z-[3600]">
        <div className="max-w-sm rounded-lg border bg-white/95 backdrop-blur p-3 shadow-lg">
          <div className="text-sm mb-2 font-medium">Instala la app en tu iPhone</div>
          <ol className="text-sm list-decimal pl-5 space-y-1">
            <li>Presiona <b>Compartir</b> en Safari (cuadrado con flecha).</li>
            <li>Elige <b>“Agregar a pantalla de inicio”</b>.</li>
            <li>Confirma con <b>Agregar</b>.</li>
          </ol>
          <div className="mt-3 flex gap-2">
            <Button size="sm" onClick={() => setShowIosGuide(false)}>Ok</Button>
            <Button size="sm" variant="outline" onClick={() => setDismissed(true)}>No mostrar</Button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
