import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";
import fs from 'fs';
import process from 'process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const base = '/';

  // Get version from package.json
  const packageJson = JSON.parse(fs.readFileSync('./package.json', 'utf-8'));
  const appVersion = packageJson.version;
  console.log(`Sogni 360 version: ${appVersion}`);

  // Determine the backend API port - default to 3002 if not specified
  const backendPort = parseInt(env.BACKEND_PORT || '3002', 10);
  console.log(`Backend API configured on port: ${backendPort}`);

  return {
    plugins: [react()],
    base,
    server: {
      host: "0.0.0.0",
      port: 5180,
      strictPort: true,
      https: false,
      allowedHosts: ["360-local.sogni.ai", "360.sogni.ai", "360-staging.sogni.ai", "localhost"],
      cors: {
        origin: ["https://360-local.sogni.ai", "http://360-local.sogni.ai", "http://localhost:5180"],
        methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        credentials: true,
        allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "X-Client-App-ID"]
      },
      headers: {
        'X-Frame-Options': 'ALLOWALL',
        'Content-Security-Policy': "frame-ancestors *;",
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'credentialless'
      },
      proxy: {
        '/api': {
          target: `http://localhost:${backendPort}`,
          changeOrigin: true,
          secure: false,
          ws: true,
          configure: (proxy, _options) => {
            proxy.on('error', (err, _req, _res) => {
              console.log('Proxy error:', err);
            });
            proxy.on('proxyReq', (proxyReq, req, _res) => {
              console.log('Proxying request:', req.method, req.url);
            });
            proxy.on('proxyRes', (proxyRes, req, _res) => {
              console.log('Proxy response:', proxyRes.statusCode, req.url);
            });
          },
        },
        '/sogni': {
          target: `http://localhost:${backendPort}`,
          changeOrigin: true,
          secure: false,
        },
        '/health': {
          target: `http://localhost:${backendPort}`,
          changeOrigin: true,
          secure: false,
        }
      }
    },
    build: {
      outDir: 'dist',
      assetsDir: 'assets',
      assetsInclude: ['**/*.json'],
      rollupOptions: {
        output: {
          entryFileNames: `assets/[name]-[hash].js`,
          chunkFileNames: `assets/[name]-[hash].js`,
          assetFileNames: (assetInfo) => {
            const info = assetInfo.name.split('.');
            const ext = info[info.length - 1];
            if (/png|jpe?g|svg|gif|tiff|bmp|ico/i.test(ext)) {
              return `assets/images/[name]-[hash].${ext}`;
            }
            if (/css/i.test(ext)) {
              return `assets/css/[name]-[hash].${ext}`;
            }
            return `assets/[name]-[hash].${ext}`;
          },
        },
      },
    },
    publicDir: 'public',
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    define: {
      'import.meta.env.APP_VERSION': JSON.stringify(appVersion),
    }
  };
});
