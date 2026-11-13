import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

// Separate command/config: the normal Vite build always uses the real client.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [{ find: /^(.*\/)?lib\/supabase$/, replacement: fileURLToPath(new URL('./src/test/smokeClient.ts', import.meta.url)) }],
  },
  server: { host: '127.0.0.1', port: 5174, strictPort: true },
})
