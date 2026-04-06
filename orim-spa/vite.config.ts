import { defineConfig, type ProxyOptions } from 'vite'
import react from '@vitejs/plugin-react'

const apiTargets = ['https://localhost:61967', 'http://localhost:61968']
let currentApiTargetIndex = 0

function advanceApiTarget() {
  if (currentApiTargetIndex >= apiTargets.length - 1) {
    return
  }

  currentApiTargetIndex += 1
  console.warn(`[vite] switching ORIM proxy target to ${apiTargets[currentApiTargetIndex]}`)
}

function createApiProxyConfig(ws = false): ProxyOptions {
  return {
    target: apiTargets[0],
    changeOrigin: true,
    secure: false,
    ws,
    configure(proxy, options) {
      const syncTarget = () => {
        options.target = apiTargets[currentApiTargetIndex]
      }

      proxy.on('proxyReq', syncTarget)

      if (ws) {
        proxy.on('proxyReqWs', syncTarget)
      }

      proxy.on('error', (error) => {
        const code = (error as NodeJS.ErrnoException).code
        if (code === 'ECONNREFUSED') {
          advanceApiTarget()
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            return undefined
          }

          if (id.includes('konva') || id.includes('react-konva')) {
            return 'whiteboard-canvas'
          }

          if (id.includes('@azure/msal-browser') || id.includes('@react-oauth/google')) {
            return 'auth-vendor'
          }

          if (id.includes('@microsoft/signalr') || id.includes('axios') || id.includes('zustand')) {
            return 'collaboration-vendor'
          }

          if (id.includes('i18next')) {
            return 'i18n-vendor'
          }

          if (
            id.includes('react-router-dom')
            || id.includes('@tanstack/react-query')
            || id.includes('react-dom')
            || id.includes('react/')
            || id.endsWith('\\react.js')
          ) {
            return 'react-vendor'
          }

          return undefined
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': createApiProxyConfig(),
      '/hubs': createApiProxyConfig(true),
    },
  },
})
