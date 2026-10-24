// Route untuk pengelolaan daftar mood
const express = require('express');
const { body } = require('express-validator');
const db = require('../db');
const { authMiddleware, validate } = require('../middleware');

const router = express.Router();

const MOOD_NOT_FOUND_MSG = 'Mood tidak ditemukan';
const UNIQUE_NAME_MSG = 'Nama mood harus unik';
const selectMoodByIdStmt = db.prepare(
  'SELECT id, name, emoji, color, created_at FROM moods WHERE id = ?'
);

const moodValidationRules = [
  body('name').trim().notEmpty().withMessage('Nama mood wajib diisi'),
  body('emoji').trim().notEmpty().withMessage('Emoji mood wajib diisi'),
  body('color')
    .optional({ values: 'falsy' })
    .trim()
    .matches(/^#[0-9A-Fa-f]{6}$/)
    .withMessage('Format warna harus berupa kode hex (contoh: #FACC15)')
];

// GET /api/moods (publik)
router.get('/', (_req, res) => {
  const moods = db
    .prepare('SELECT id, name, emoji, color, created_at FROM moods ORDER BY id ASC')
    .all();

  return res.status(200).json({
    success: true,
    data: moods,
    message: 'Daftar mood berhasil diambil'
  });
});

// POST /api/moods (auth)
router.post(
  '/',
  authMiddleware,
  moodValidationRules,
  validate,
  (req, res) => {
    const name = req.body.name.trim();
    const emoji = req.body.emoji.trim();
    const color = req.body.color ? req.body.color.trim() : '#9CA3AF';

    const duplicate = db
      .prepare('SELECT id FROM moods WHERE lower(name) = lower(?)')
      .get(name);

    if (duplicate) {
      return res.status(409).json({
        success: false,
        data: null,
        message: 'Nama mood sudah ada',
        errors: [{ field: 'name', message: UNIQUE_NAME_MSG }]
      });
    }

    const info = db
      .prepare('INSERT INTO moods (name, emoji, color) VALUES (?, ?, ?)')
      .run(name, emoji, color);

    const newMood = selectMoodByIdStmt.get(Number(info.lastInsertRowid));

    return res.status(201).json({
      success: true,
      data: newMood,
      message: 'Mood baru berhasil ditambahkan'
    });
  }
);

// PUT /api/moods/:id (auth)
router.put(
  '/:id',
  authMiddleware,
  moodValidationRules,
  validate,
  (req, res) => {
    const moodId = Number(req.params.id);
    const existing = selectMoodByIdStmt.get(moodId);

    if (!existing) {
      return res.status(404).json({
        success: false,
        data: null,
        message: MOOD_NOT_FOUND_MSG,
        errors: []
      });
    }

    const name = req.body.name.trim();
    const emoji = req.body.emoji.trim();
    const color = req.body.color ? req.body.color.trim() : existing.color;

    const duplicate = db
      .prepare('SELECT id FROM moods WHERE lower(name) = lower(?) AND id != ?')
      .get(name, moodId);

    if (duplicate) {
      return res.status(409).json({
        success: false,
        data: null,
        message: 'Nama mood sudah digunakan',
        errors: [{ field: 'name', message: UNIQUE_NAME_MSG }]
      });
    }

    db.prepare('UPDATE moods SET name = ?, emoji = ?, color = ? WHERE id = ?').run(
      name,
      emoji,
      color,
      moodId
    );

    const updated = selectMoodByIdStmt.get(moodId);

    return res.status(200).json({
      success: true,
      data: updated,
      message: 'Mood berhasil diperbarui'
    });
  }
);

// DELETE /api/moods/:id (auth)
router.delete('/:id', authMiddleware, (req, res) => {
  const moodId = Number(req.params.id);
  const existing = selectMoodByIdStmt.get(moodId);

  if (!existing) {
    return res.status(404).json({
      success: false,
      data: null,
      message: MOOD_NOT_FOUND_MSG,
      errors: []
    });
  }

  const usageCount =
    db.prepare('SELECT COUNT(*) as count FROM entries WHERE mood_id = ?').get(moodId)?.count || 0;

  if (usageCount > 0) {
    return res.status(409).json({
      success: false,
      data: null,
      message: 'Mood tidak dapat dihapus karena masih digunakan oleh entri jurnal',
      errors: []
    });
  }

  db.prepare('DELETE FROM moods WHERE id = ?').run(moodId);

  return res.status(200).json({
    success: true,
    data: { id: moodId },
    message: 'Mood berhasil dihapus'
  });
});

module.exports = router;
