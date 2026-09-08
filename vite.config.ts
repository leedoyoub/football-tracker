import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  base: '/football-tracker/',
  build: { target: 'es2020' },
  plugins: [react(), tailwindcss()],
})
