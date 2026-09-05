import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/',
  plugins: [react()],
  server: {
    port: 3007,
    proxy: {
      '/api': 'http://localhost:4007',
    },
  },
  preview: {
    allowedHosts: ['demo.dhisoft.in'],
  },
});
