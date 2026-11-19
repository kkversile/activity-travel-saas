import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig(function (_a) {
    var mode = _a.mode;
    var env = loadEnv(mode, '.', '');
    return {
        base: mode === 'production' ? '/voya/' : (env.VITE_BASE_PATH || '/'),
        plugins: [react()],
        build: {
            manifest: true,
            rollupOptions: { output: { manualChunks: function (id) {
                        if (id.replace(/\\/g, '/').indexOf('/node_modules/xlsx/') !== -1)
                            return 'spreadsheet';
                    } } },
        },
        server: {
            port: 3007,
            proxy: {
                '/api': 'http://localhost:4007',
            },
        },
        preview: {
            allowedHosts: true,
            proxy: {
                '/voya/api': { target: 'http://127.0.0.1:4007', rewrite: function (requestPath) { return requestPath.replace(/^\/voya/, ''); } },
                '/api': 'http://127.0.0.1:4007',
            },
        },
    };
});
