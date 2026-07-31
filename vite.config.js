import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Vite 配置:react 插件让浏览器认识 JSX,tailwindcss 插件启用样式框架
export default defineConfig({
  plugins: [react(), tailwindcss()],
})
