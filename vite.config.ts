import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';
import tailwindcss from '@tailwindcss/vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';

export default defineConfig({
  plugins: [tailwindcss(), sveltekit(), SvelteKitPWA({
    registerType: 'autoUpdate',
    manifestFilename: 'manifest.json',
    manifest: {
      name: 'HostelSplit', short_name: 'HostelSplit', description: 'Share hostel expenses and settle fairly',
      start_url: '/', scope: '/', display: 'standalone', background_color: '#f4f6f2', theme_color: '#123b38',
      icons: [
        { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
        { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
      ]
    },
    workbox: { navigateFallback: null, runtimeCaching: [] }
  })],
  test: { include: ['src/**/*.test.ts', 'bot/**/*.test.ts'] }
});
