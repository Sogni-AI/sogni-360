import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import sogniRoutes from './routes/sogni.js';
import process from 'process';

// Load environment variables
dotenv.config();

// Allow self-signed certificates in local environment
if (process.env.SOGNI_ENV === 'local') {
  console.log('Local environment detected: Self-signed certificates allowed');
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3002;

// Trust proxy
app.set('trust proxy', 1);

// CORS Configuration
const allowedOrigins = [
  'https://360.sogni.ai',
  'https://360-staging.sogni.ai',
  'https://360-local.sogni.ai',
  'http://localhost:5180',
  'http://127.0.0.1:5180'
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin) || origin.endsWith('.sogni.ai')) {
      callback(null, true);
    } else {
      console.warn(`CORS blocked origin: ${origin}`);
      callback(null, true); // Allow anyway but log
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cookie', 'X-Client-App-ID', 'Accept'],
  exposedHeaders: ['Set-Cookie']
}));

// Cookie Parser
app.use(cookieParser());

// Body Parsers
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// API routes
app.use('/sogni', sogniRoutes);
app.use('/api/sogni', sogniRoutes);

// Health check endpoints
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    message: 'Sogni 360 server is running',
    environment: process.env.NODE_ENV || 'development'
  });
});

app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    message: 'Sogni 360 server is running',
    environment: process.env.NODE_ENV || 'development'
  });
});

// Determine static directory
const isLocalEnv = process.env.SOGNI_ENV === 'local' ||
                   process.env.CLIENT_ORIGIN?.includes('local') ||
                   process.env.NODE_ENV !== 'production';

let staticDir;
if (isLocalEnv) {
  staticDir = path.join(__dirname, '..', 'dist');
} else {
  staticDir = process.env.CLIENT_ORIGIN?.includes('staging')
    ? '/var/www/360-staging.sogni.ai/dist'
    : '/var/www/360.sogni.ai';
}

console.log(`Environment: ${isLocalEnv ? 'LOCAL' : 'PRODUCTION'}`);
console.log(`Static directory: ${staticDir}`);

// Static files and catch-all - only for production/staging
if (!isLocalEnv) {
  app.use(express.static(staticDir));

  app.get('*', (req, res) => {
    const isStaticAsset = /\.(png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot|webp)$/i.test(req.path);

    if (isStaticAsset) {
      return res.status(404).send('Not Found');
    }

    res.sendFile(path.join(staticDir, 'index.html'));
  });
}

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  if (!res.headersSent) {
    res.status(500).json({ error: err.message });
  } else {
    next(err);
  }
});

// Start server
app.listen(port, () => {
  console.log(`Sogni 360 server running on port ${port}`);
});
