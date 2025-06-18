import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  root: '.',                     // מצביע על שורש הפרויקט
  build: {
    outDir: 'dist',              // תיקייה שיוצרת הקומפייל
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
});