import { defineConfig } from 'vite';
import laravel from 'laravel-vite-plugin';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
    resolve: {
        alias: {
            '@': fileURLToPath(new URL('./resources/js', import.meta.url)),
            '@css': fileURLToPath(new URL('./resources/css', import.meta.url)),
        },
    },
    plugins: [
        react(),
        laravel({
            input: ['resources/css/app.css', 'resources/js/main.jsx'],
            refresh: true,
        }),
    ],
    server: {
        host: '127.0.0.1',
        watch: {
            ignored: ['**/storage/framework/views/**'],
        },
    },
    build: {
        rollupOptions: {
            output: {
                // Split the heavy, rarely-changing dependencies into their own chunks so
                // they cache across deploys instead of being re-downloaded inside one
                // ~600 kB app bundle on every change.
                manualChunks: {
                    'malaysia-regions': ['./resources/js/assets/maps/malaysia-adm1.geo.json'],
                    'vendor-leaflet': ['leaflet', 'react-leaflet', 'react-leaflet-cluster', 'leaflet.markercluster'],
                    'vendor-react': ['react', 'react-dom', 'react-router-dom'],
                    'vendor-dnd': ['@dnd-kit/core', '@dnd-kit/sortable', '@dnd-kit/utilities'],
                },
            },
        },
    },
});
