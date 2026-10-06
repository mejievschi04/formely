import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
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
        // Implicit: php artisan serve (8000). Alt port: VOLTA_BACKEND_URL=http://localhost:8001 npm run dev
        target: process.env.VOLTA_BACKEND_URL || 'http://localhost:8000',
        changeOrigin: true,
        secure: false,
      },
      '/storage': {
        target: process.env.VOLTA_BACKEND_URL || 'http://localhost:8000',
        changeOrigin: true,
        secure: false,
      },
    },
    // Warm up frequently used files - eliminates transform waterfalls on first load
    warmup: {
      clientFiles: [
        './src/App.jsx',
        './src/main.jsx',
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
        onlyExplicitManualChunks: true,
        manualChunks(id) {
          if (id.includes('/node_modules/three/')) return 'three';
          // Iconițele Phosphor nu au chunk propriu: fiecare intră lângă paginile care o folosesc.
          // Un chunk comun (275 KB, toate greutățile fiecărei iconițe) se descărca la pornire pe orice pagină.
          if (id.includes('/node_modules/lucide-react/')) return 'icons-lucide';
          if (id.includes('/node_modules/xlsx/')) return 'xlsx';
          if (id.includes('pdfjs-dist') && id.includes('pdf.worker')) {
            return;
          }
          if (id.includes('/node_modules/pdfjs-dist/') || id.includes('/node_modules/pdf-lib/')) return 'pdf';
          if (id.includes('/node_modules/recharts/')) return 'charts';
          if (/\/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'react-vendor';
        },
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
        '@phosphor-icons/react',
        'lucide-react',
        'recharts',
        'three',
      ],
      exclude: ['pdfjs-dist'],
    },
})
