// src/main.tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./index.css";

// 👇 Añade este import
import InstallPrompt from "./pwa/InstallPrompt";

const root = document.getElementById("root");
if (!root) throw new Error("No se encontró el elemento #root");

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <App />
      {/* 👇 Muestra botón (Android/Chrome) o guía (iOS Safari) para instalar */}
      <InstallPrompt />
    </BrowserRouter>
  </React.StrictMode>
);

/** ===== Registro del Service Worker (una sola vez) =====
 *  Requisitos:
 *  - Colocar /sw.js en la carpeta "public".
 *  - Usar HTTPS (o localhost).
 *  - Probar con `vite build && vite preview` (no con `vite dev`).
 */
if ("serviceWorker" in navigator) {
  // registra ASAP; en iOS no afecta, pero en Android mejora el ready
  const registerSW = async () => {
    try {
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });

      // SW -> Página (mensajes opcionales)
      navigator.serviceWorker.addEventListener("message", (event) => {
        if (event.data?.type === "SW_READY") {
          console.log("[SW] listo");
        }
        if (event.data?.type === "SW_UPDATE") {
          console.log("[SW] actualización instalada; recarga para ver cambios");
        }
      });

      // Avísale que la página está lista
      reg.active?.postMessage?.({ type: "PAGE_READY" });

      // Si hay un nuevo SW en espera, fuerza el takeover al recargar
      let refreshing = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (refreshing) return;
        refreshing = true;
        // Opcional: puedes hacer window.location.reload();
      });
    } catch (e) {
      console.error("No se pudo registrar el Service Worker", e);
    }
  };

  // contexto seguro + evita private mode iOS (donde SW está deshabilitado)
  if (window.isSecureContext) {
    registerSW();
  } else {
    console.warn("Service Worker requiere contexto seguro (HTTPS o localhost).");
  }
}
