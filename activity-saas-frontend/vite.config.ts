import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    base: mode === 'production' ? '/voya/' : (env.VITE_BASE_PATH || '/'),
    plugins: [react()],
    server: {
      port: 3007,
      proxy: {
        '/api': 'http://localhost:4007',
      },
    },
    preview: {
      allowedHosts: true,
    },
  };
});
