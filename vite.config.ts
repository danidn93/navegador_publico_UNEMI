import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png', 'icons/maskable-512.png'],
      manifest: {
        name: 'UNEMI Campus Navigator',
        short_name: 'UNEMI Campus',
        description: 'Mapa institucional UNEMI con rutas y navegación por voz.',
        theme_color: '#0F172A',
        background_color: '#0B1220',
        display: 'standalone',
        lang: 'es',
        start_url: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable any' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp}'],
        globIgnores: ['**/mascota-unemi.png'],
        runtimeCaching: [
          {
            urlPattern: ({ url }: { url: URL }) => url.origin.includes('tile.openstreetmap.org'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'osm-tiles',
              expiration: { maxEntries: 400, maxAgeSeconds: 60 * 60 * 24 * 7 }
            }
          },
          {
            urlPattern: ({ url }: { url: URL }) => url.origin.includes('router.project-osrm.org'),
            handler: 'NetworkFirst',
            options: { cacheName: 'osrm' }
          },
          {
            urlPattern: ({ url }: { url: URL }) => url.origin.includes('cdnjs.cloudflare.com'),
            handler: 'CacheFirst',
            options: { cacheName: 'cdn' }
          }
        ]
      }
    })
  ]
})
