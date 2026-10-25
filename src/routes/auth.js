// Route untuk autentikasi pengguna (register, login, profil me)
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body } = require('express-validator');
const db = require('../db');
const { authMiddleware, asyncHandler, validate, getJwtSecret } = require('../middleware');

const router = express.Router();

const INVALID_EMAIL_MSG = 'Format email tidak valid';
function generateToken(user) {
  return jwt.sign(
    { id: user?.id, email: user?.email, name: user?.name },
    getJwtSecret(),
    { expiresIn: '7d' }
  );
}

// POST /api/auth/register
router.post(
  '/register',
  [
    body('name').trim().notEmpty().withMessage('Nama wajib diisi'),
    body('email').trim().isEmail().withMessage(INVALID_EMAIL_MSG).normalizeEmail(),
    body('password')
      .isLength({ min: 8 })
      .withMessage('Password minimal 8 karakter')
  ],
  validate,
  asyncHandler(async (req, res) => {
    const { name, email, password } = req.body || {};

    const existingResult = await db.execute({
      sql: 'SELECT id FROM users WHERE lower(email) = lower(?)',
      args: [email]
    });
    const existingUser = existingResult.rows[0];

    if (existingUser) {
      return res.status(409).json({
        success: false,
        data: null,
        message: 'Email sudah digunakan oleh pengguna lain',
        errors: [{ field: 'email', message: 'Email sudah terdaftar' }]
      });
    }

    const passwordHash = bcrypt.hashSync(password, 10);
    const info = await db.execute({
      sql: 'INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)',
      args: [name.trim(), email.toLowerCase(), passwordHash]
    });

    const userResult = await db.execute({
      sql: 'SELECT id, name, email, created_at FROM users WHERE id = ?',
      args: [Number(info.lastInsertRowid)]
    });
    const user = userResult.rows[0];
    const token = generateToken(user);

    return res.status(201).json({
      success: true,
      data: { user, token },
      message: 'Registrasi pengguna berhasil'
    });
  })
);

// POST /api/auth/login
router.post(
  '/login',
  [
    body('email').trim().isEmail().withMessage(INVALID_EMAIL_MSG),
    body('password').notEmpty().withMessage('Password wajib diisi')
  ],
  validate,
  asyncHandler(async (req, res) => {
    const { email, password } = req.body || {};

    const userResult = await db.execute({
      sql: 'SELECT id, name, email, password_hash, created_at FROM users WHERE lower(email) = lower(?)',
      args: [email.trim()]
    });
    const userRow = userResult.rows[0];

    if (!userRow || !bcrypt.compareSync(password, userRow.password_hash)) {
      return res.status(401).json({
        success: false,
        data: null,
        message: 'Email atau password salah',
        errors: []
      });
    }

    const user = {
      id: userRow.id,
      name: userRow.name,
      email: userRow.email,
      created_at: userRow.created_at
    };

    const token = generateToken(user);

    return res.status(200).json({
      success: true,
      data: { user, token },
      message: 'Login berhasil'
    });
  })
);

// GET /api/auth/me
router.get('/me', authMiddleware, asyncHandler(async (req, res) => {
  const result = await db.execute({
    sql: 'SELECT id, name, email, created_at FROM users WHERE id = ?',
    args: [req.user?.id]
  });
  const user = result.rows[0];

  if (!user) {
    return res.status(404).json({
      success: false,
      data: null,
      message: 'Pengguna tidak ditemukan',
      errors: []
    });
  }

  return res.status(200).json({
    success: true,
    data: user,
    message: 'Profil pengguna berhasil diambil'
  });
}));

module.exports = router;
