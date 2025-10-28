/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

declare module 'virtual:pwa-register' {
  export const registerSW: (opts?: { immediate?: boolean }) => void
}

declare module 'leaflet-routing-machine';
