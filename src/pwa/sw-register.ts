// src/pwa/sw-register.ts
export function registerSW() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      const swUrl = '/sw.js';
      navigator.serviceWorker
        .register(swUrl, { scope: '/' })
        .then(reg => {
          // actualizaciones en caliente
          reg.onupdatefound = () => {
            const installing = reg.installing;
            if (!installing) return;
            installing.onstatechange = () => {
              if (installing.state === 'installed') {
                // Si hubo update, puedes notificar al usuario
                // console.log('PWA lista (o actualizada).');
              }
            };
          };
        })
        .catch((e) => console.error('SW registration failed', e));
    });
  }
}
