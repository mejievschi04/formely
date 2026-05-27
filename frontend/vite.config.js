import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const pdfWorkerPath = require.resolve('pdfjs-dist/build/pdf.worker.mjs');

function pdfJsWorkerAssetPlugin() {
  return {
    name: 'formely-pdfjs-worker-asset',
    configureServer(server) {
      server.middlewares.use('/assets/pdf.worker.js', (req, res) => {
        res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache');
        fs.createReadStream(pdfWorkerPath).pipe(res);
      });
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'assets/pdf.worker.js',
        source: fs.readFileSync(pdfWorkerPath),
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), pdfJsWorkerAssetPlugin()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    // Force single React instance - prevents "Cannot set properties of undefined (setting 'Children')"
    dedupe: ['react', 'react-dom', 'react-is'],
  },
  server: {
    host: '0.0.0.0', // Acceptă conexiuni de pe toate interfețele
    port: 5173,
    allowedHosts: [
      '.ngrok-free.app',
      '.ngrok.io',
      '.ngrok.app',
    ],
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        secure: false,
      },
      '/storage': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        secure: false,
      },
    },
    // Warm up frequently used files - eliminates transform waterfalls on first load
    warmup: {
      clientFiles: [
        './src/App.jsx',
        './src/main.jsx',
        './src/pages/DashboardPage.jsx',
        './src/pages/CoursesPage.jsx',
        './src/pages/LoginPage.jsx',
        './src/components/SplashScreen.jsx',
        './src/contexts/AuthContext.jsx',
      ],
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Inline small assets for fewer requests
        assetFileNames: 'assets/[name]-[hash][extname]',
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
      },
    },
    // Optimize chunk size - increased limit for better splitting
    chunkSizeWarningLimit: 1500,
    // Enable source maps for production debugging (optional)
    // Set to true if you need debugging in production, but increases bundle size
    sourcemap: false,
    // Minification
    minify: 'esbuild',
    // Target modern browsers for smaller bundles
    target: 'esnext',
    // Output directory for production build
    outDir: 'dist',
    // Assets directory
    assetsDir: 'assets',
  },
  // Optimize dependencies - pre-bundle for faster dev startup
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-router-dom',
      'axios',
      '@dnd-kit/core',
      '@dnd-kit/sortable',
      '@dnd-kit/utilities',
      'recharts',
    ],
  },
})
