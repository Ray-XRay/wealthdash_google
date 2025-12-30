import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  const env = loadEnv(mode, (process as any).cwd(), '');
  return {
    plugins: [react()],
    build: {
      target: 'esnext'
    },
    define: {
      // Polyfill process.env.API_KEY. 
      // Vercel injects env vars into 'process.env', while local dev uses '.env' files loaded into 'env'.
      'process.env.API_KEY': JSON.stringify(env.API_KEY || process.env.API_KEY)
    }
  };
});