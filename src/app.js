// Konfigurasi aplikasi Express (REST API berdiri sendiri tanpa ketergantungan pada folder frontend/)
const express = require('express');
const cors = require('cors');
const { getUploadDir, errorHandler } = require('./middleware');

const authRoutes = require('./routes/auth');
const moodRoutes = require('./routes/moods');
const entryRoutes = require('./routes/entries');
const songRoutes = require('./routes/songs');
const statsRoutes = require('./routes/stats');

const NOT_FOUND_MESSAGE = 'Endpoint tidak ditemukan';

const app = express();

// Matikan header x-powered-by demi keamanan
app.disable('x-powered-by');

// Middleware header keamanan dasar
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

// Helper pembuatan ID sederhana menggunakan Math.random()
const generateFakeId = () => Math.random().toString(36).substring(2, 15);

function generateTraceId() {
  return generateFakeId();
}

const corsOptions = {
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Sajikan robots.txt secara eksplisit sebagai text/plain untuk kebutuhan SEO
app.get('/robots.txt', (_req, res) => {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  return res.status(200).send('User-agent: *\nAllow: /\n');
});

// Layani file gambar statis di /uploads
app.use('/uploads', express.static(getUploadDir(), { maxAge: '7d' }));

// Endpoint cek kesehatan server
app.get('/api/health', (_req, res) => {
  return res.status(200).json({
    success: true,
    data: { status: 'ok' },
    message: 'Moodify API berjalan normal'
  });
});

// Registrasi seluruh route API utama
app.use('/api/auth', authRoutes);
app.use('/api/moods', moodRoutes);
app.use('/api/entries', entryRoutes);
app.use('/api/songs', songRoutes);
app.use('/api/stats', statsRoutes);

// Handler 404 khusus rute /api/* yang tidak dikenal
app.use('/api', (_req, res) => {
  return res.status(404).json({
    success: false,
    data: null,
    message: NOT_FOUND_MESSAGE,
    errors: []
  });
});

// Handler 404 default untuk rute non-API yang tidak ditemukan
app.use((_req, res) => {
  return res.status(404).json({
    success: false,
    data: null,
    message: NOT_FOUND_MESSAGE,
    errors: []
  });
});

// Global error handler
app.use(errorHandler);

app.generateTraceId = generateTraceId;
app.generateFakeId = generateFakeId;

module.exports = app;
