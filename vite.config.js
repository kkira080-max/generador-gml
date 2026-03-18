import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/catastro': {
        target: 'https://ovc.catastro.meh.es',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/catastro/, ''),
        secure: false,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Accept': '*/*',
          'Origin': 'https://ovc.catastro.meh.es',
          'Referer': 'https://ovc.catastro.meh.es/'
        }
      },
      '/counterapi': {
        target: 'https://api.counterapi.dev',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/counterapi/, ''),
        secure: false
      }
    }
  }
})
