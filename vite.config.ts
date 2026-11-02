import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// 建物写真整理は利用者の PC の http://localhost:5177/ だけで動く（SURVIA・ランチャーと同じ固定の場所。別の port には逃げない）。
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  server: { host: 'localhost', port: 5177, strictPort: true },
  preview: { host: 'localhost', port: 5177, strictPort: true },
})
