import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  base: '/onyx/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      devOptions: { enabled: false },
      includeAssets: [
        'favicon.ico',
        'favicon.png',
        'apple-touch-icon.png',
        'icons/icon-48.png',
        'icons/icon-72.png',
        'icons/icon-96.png',
        'icons/icon-120.png',
        'icons/icon-144.png',
        'icons/icon-152.png',
        'icons/icon-167.png',
        'icons/icon-180.png',
        'icons/icon-192.png',
        'icons/icon-512.png',
        'icons/maskable-192.png',
        'icons/maskable-512.png',
      ],
      manifest: {
        id: '/onyx/',
        name: 'ONYX POS',
        short_name: 'ONYX POS',
        description: 'ONYX POS — point of sale, inventory, invoicing and analytics.',
        lang: 'en',
        start_url: '/onyx/',
        scope: '/onyx/',
        theme_color: '#dc2626',
        background_color: '#fff7f4',
        display: 'fullscreen',
        display_override: ['fullscreen', 'standalone', 'minimal-ui', 'browser'],
        orientation: 'any',
        categories: ['business', 'finance', 'productivity', 'utilities'],
        shortcuts: [
          { name: 'Make a sale', short_name: 'Sales', description: 'Open the POS sales panel', url: '/onyx/sales', icons: [{ src: '/icons/maskable-192.png', sizes: '192x192', type: 'image/png' }] },
          { name: 'Dashboard', short_name: 'Home', description: 'View your business overview', url: '/onyx/dashboard', icons: [{ src: '/icons/maskable-192.png', sizes: '192x192', type: 'image/png' }] },
          { name: 'Transactions', short_name: 'Sales', description: 'Open transactions & invoices', url: '/onyx/transactions', icons: [{ src: '/icons/maskable-192.png', sizes: '192x192', type: 'image/png' }] },
        ],
        icons: [
          { src: '/icons/icon-48.png', sizes: '48x48', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-72.png', sizes: '72x72', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-96.png', sizes: '96x96', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-120.png', sizes: '120x120', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-144.png', sizes: '144x144', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-152.png', sizes: '152x152', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-167.png', sizes: '167x167', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-180.png', sizes: '180x180', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,webmanifest}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          {
            urlPattern: /\/(api|auth)\//,
            handler: 'NetworkFirst',
            method: 'GET',
            options: {
              cacheName: 'onyx-api-cache',
              networkTimeoutSeconds: 10,
              expiration: { maxEntries: 80, maxAgeSeconds: 60 * 60 },
              cacheableResponse: { statuses: [0, 200] }
            }
          },
          {
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp|ico)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'onyx-images-cache',
              expiration: {
                maxEntries: 80,
                maxAgeSeconds: 60 * 60 * 24 * 30
              }
            }
          }
        ]
      }
    })
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@shared': fileURLToPath(new URL('../../packages/shared/src', import.meta.url))
    }
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true
      }
    }
  }
});
