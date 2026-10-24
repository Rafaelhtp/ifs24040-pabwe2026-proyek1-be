// Middleware autentikasi JWT, upload file (multer), validasi, dan error handler global
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const { validationResult } = require('express-validator');

const RUNTIME_FALLBACK_KEY = crypto.randomBytes(32).toString('hex');
const SERVER_ERROR_MSG = 'Terjadi kesalahan pada server';

function getJwtSecret() {
  return process.env.JWT_SECRET || RUNTIME_FALLBACK_KEY;
}

// Pastikan direktori upload dapat ditulis oleh user non-root di container Alpine
function getUploadDir(customDir) {
  const defaultDir = path.join(__dirname, '..', 'uploads');
  const rawDir = customDir || process.env.UPLOAD_DIR || defaultDir;
  const resolved = path.resolve(process.cwd(), rawDir);

  try {
    if (!fs.existsSync(resolved)) {
      fs.mkdirSync(resolved, { recursive: true });
    }
    fs.accessSync(resolved, fs.constants.W_OK);
    return resolved;
  } catch {
    const fallback = path.join(os.tmpdir(), 'moodify-uploads');
    if (!fs.existsSync(fallback)) {
      fs.mkdirSync(fallback, { recursive: true });
    }
    return fallback;
  }
}

// Hapus file dari folder upload dengan aman jika ada
function removeUploadedFile(filename) {
  if (!filename) return false;
  try {
    const safeName = path.basename(filename);
    const filePath = path.join(getUploadDir(), safeName);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, getUploadDir());
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `${uuidv4()}${ext}`);
  }
});

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);

const fileFilter = (_req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ALLOWED_MIME_TYPES.has(file.mimetype) && ALLOWED_EXTENSIONS.has(ext)) {
    cb(null, true);
  } else {
    const err = new Error('Tipe file tidak didukung. Gunakan format JPG, PNG, atau WEBP');
    err.status = 400;
    cb(err, false);
  }
};

const multerInstance = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 2 * 1024 * 1024 // Maksimal 2 MB
  }
});

function formatUploadError(err, fieldName) {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return {
        status: 413,
        body: {
          success: false,
          data: null,
          message: 'Ukuran file terlalu besar. Maksimal 2 MB',
          errors: [{ field: fieldName, message: 'Maksimal ukuran file adalah 2 MB' }]
        }
      };
    }
    return {
      status: 400,
      body: {
        success: false,
        data: null,
        message: `Kesalahan upload file: ${err.message}`,
        errors: [{ field: fieldName, message: err.message }]
      }
    };
  }

  const fallbackMsg = err?.message || 'Gagal mengunggah file';
  return {
    status: err?.status || 400,
    body: {
      success: false,
      data: null,
      message: fallbackMsg,
      errors: [{ field: fieldName, message: fallbackMsg }]
    }
  };
}

function uploadSingle(fieldName) {
  return (req, res, next) => {
    const uploader = multerInstance.single(fieldName);
    uploader(req, res, (err) => {
      if (!err) return next();
      const formatted = formatUploadError(err, fieldName);
      return res.status(formatted.status).json(formatted.body);
    });
  };
}

function authMiddleware(req, res, next) {
  const authHeader = req.headers?.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      data: null,
      message: 'Akses ditolak. Token tidak ditemukan',
      errors: []
    });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, getJwtSecret());
    req.user = {
      id: decoded?.id,
      email: decoded?.email,
      name: decoded?.name
    };
    return next();
  } catch {
    return res.status(401).json({
      success: false,
      data: null,
      message: 'Token tidak valid atau sudah kedaluwarsa',
      errors: []
    });
  }
}

function validate(req, res, next) {
  const result = validationResult(req);
  if (result.isEmpty()) {
    return next();
  }

  if (req.file?.filename) {
    removeUploadedFile(req.file.filename);
  }

  const errors = result.array().map((item) => ({
    field: item.path || item.param,
    message: item.msg
  }));

  return res.status(400).json({
    success: false,
    data: null,
    message: errors[0]?.message,
    errors
  });
}

function errorHandler(err, req, res, _next) {
  if (req.file?.filename) {
    removeUploadedFile(req.file.filename);
  }

  const statusCode = err?.status || 500;
  const isProd = process.env.NODE_ENV === 'production';

  let message = err?.message || SERVER_ERROR_MSG;
  if (statusCode === 500 && isProd) {
    message = SERVER_ERROR_MSG;
  }

  const response = {
    success: false,
    data: null,
    message,
    errors: err?.errors || []
  };

  if (!isProd && err?.stack && statusCode === 500) {
    response.debug = err.stack;
  }

  return res.status(statusCode).json(response);
}

module.exports = {
  authMiddleware,
  uploadSingle,
  validate,
  errorHandler,
  getUploadDir,
  removeUploadedFile,
  getJwtSecret,
  formatUploadError
};
