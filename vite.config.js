import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import laravel from 'laravel-vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
    plugins: [
        react(),
        laravel({
            input: ['resources/css/app.css', 'resources/js/app.js'],
            refresh: true,
        }),
        tailwindcss(),
        VitePWA({
            strategies: 'injectManifest',
            srcDir: 'resources/js',
            outDir: 'public',
            filename: 'sw.js',
            buildBase: '/',
            scope: '/',
            includeAssets: ['offline.html', 'icons/health-center.svg'],
            injectRegister: null,
            registerType: 'autoUpdate',
            manifest: {
                name: 'Barangay Health Center EHR',
                short_name: 'BHC EHR',
                description: 'Offline-first patient and immunization records for authorized health workers.',
                theme_color: '#0f766e',
                background_color: '#f8fafc',
                display: 'standalone',
                start_url: '/',
                scope: '/',
                icons: [{
                    src: '/icons/health-center.svg',
                    sizes: 'any',
                    type: 'image/svg+xml',
                    purpose: 'any maskable',
                }],
            },
        }),
    ],
    server: {
        watch: {
            ignored: ['**/storage/framework/views/**'],
        },
    },
});
