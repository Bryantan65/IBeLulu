import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            '@': '/src',
        },
    },
    server: {
        proxy: {
            '/api/orchestrate': {
                target: 'https://api.ap-southeast-1.dl.watson-orchestrate.ibm.com',
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/api\/orchestrate/, ''),
            },
        },
    },
})
