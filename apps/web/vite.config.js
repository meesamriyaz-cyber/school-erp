import process from 'node:process'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  if (mode === 'production') {
    const apiBaseUrl = env.VITE_API_BASE_URL
    if (!apiBaseUrl) {
      throw new Error('VITE_API_BASE_URL must be set for production builds')
    }

    let parsedApiBaseUrl
    try {
      parsedApiBaseUrl = new URL(apiBaseUrl)
    } catch {
      throw new Error('VITE_API_BASE_URL must be an absolute HTTPS URL ending in /api/v1')
    }

    const normalizedPath = parsedApiBaseUrl.pathname.replace(/\/+$/, '')
    if (
      parsedApiBaseUrl.protocol !== 'https:' ||
      ['localhost', '127.0.0.1', '::1'].includes(parsedApiBaseUrl.hostname) ||
      normalizedPath !== '/api/v1' ||
      parsedApiBaseUrl.search ||
      parsedApiBaseUrl.hash ||
      parsedApiBaseUrl.username ||
      parsedApiBaseUrl.password
    ) {
      throw new Error('VITE_API_BASE_URL must be a production HTTPS API origin ending in /api/v1')
    }
  }

  return {
    plugins: [react()],

    server: {
      proxy: {
        '/api': {
          target: 'http://localhost:5000',
          changeOrigin: true,
          secure: false,
        },
      },
    },

    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/tests/setup.js'],
      clearMocks: true,
    },
  }
})
