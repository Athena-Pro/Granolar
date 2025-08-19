import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// If building on GitHub Actions for project pages, BASE_PATH will be like "/repo-name/"
const base = process.env.BASE_PATH || '/'

export default defineConfig({
  plugins: [react()],
  base,
})
