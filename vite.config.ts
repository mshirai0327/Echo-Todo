import { defineConfig } from 'vite'
import { resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  root: resolve(__dirname, 'src/popup'),
  publicDir: resolve(__dirname, 'public'),
  base: './',
  build: {
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'src/popup/popup.html'),
        background: resolve(__dirname, 'src/background/background.ts'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: '[name].js',
        assetFileNames: '[name].[ext]',
      },
    },
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
  },
})
