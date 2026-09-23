import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig(({ mode }) => ({
  base: '/football-tracker/',
  build: { target: 'es2020' },
  define: { __FOOTBALL_TRACKER_DEV__: JSON.stringify(mode === 'development') },
  plugins: [react(), tailwindcss()],
}))
