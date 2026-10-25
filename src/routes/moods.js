// Route untuk pengelolaan daftar mood
const express = require('express');
const { body } = require('express-validator');
const db = require('../db');
const { authMiddleware, asyncHandler, validate } = require('../middleware');

const router = express.Router();

const MOOD_NOT_FOUND_MSG = 'Mood tidak ditemukan';
const UNIQUE_NAME_MSG = 'Nama mood harus unik';
async function selectMoodById(id) {
  const result = await db.execute({
    sql: 'SELECT id, name, emoji, color, created_at FROM moods WHERE id = ?',
    args: [id]
  });
  return result.rows[0];
}

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
router.get('/', asyncHandler(async (_req, res) => {
  const result = await db.execute(
    'SELECT id, name, emoji, color, created_at FROM moods ORDER BY id ASC'
  );
  const moods = result.rows;

  return res.status(200).json({
    success: true,
    data: moods,
    message: 'Daftar mood berhasil diambil'
  });
}));

// POST /api/moods (auth)
router.post(
  '/',
  authMiddleware,
  moodValidationRules,
  validate,
  asyncHandler(async (req, res) => {
    const name = req.body.name.trim();
    const emoji = req.body.emoji.trim();
    const color = req.body.color ? req.body.color.trim() : '#9CA3AF';

    const duplicateResult = await db.execute({
      sql: 'SELECT id FROM moods WHERE lower(name) = lower(?)',
      args: [name]
    });
    const duplicate = duplicateResult.rows[0];

    if (duplicate) {
      return res.status(409).json({
        success: false,
        data: null,
        message: 'Nama mood sudah ada',
        errors: [{ field: 'name', message: UNIQUE_NAME_MSG }]
      });
    }

    const info = await db.execute({
      sql: 'INSERT INTO moods (name, emoji, color) VALUES (?, ?, ?)',
      args: [name, emoji, color]
    });

    const newMood = await selectMoodById(Number(info.lastInsertRowid));

    return res.status(201).json({
      success: true,
      data: newMood,
      message: 'Mood baru berhasil ditambahkan'
    });
  })
);

// PUT /api/moods/:id (auth)
router.put(
  '/:id',
  authMiddleware,
  moodValidationRules,
  validate,
  asyncHandler(async (req, res) => {
    const moodId = Number(req.params.id);
    const existing = await selectMoodById(moodId);

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

    const duplicateResult = await db.execute({
      sql: 'SELECT id FROM moods WHERE lower(name) = lower(?) AND id != ?',
      args: [name, moodId]
    });
    const duplicate = duplicateResult.rows[0];

    if (duplicate) {
      return res.status(409).json({
        success: false,
        data: null,
        message: 'Nama mood sudah digunakan',
        errors: [{ field: 'name', message: UNIQUE_NAME_MSG }]
      });
    }

    await db.execute({
      sql: 'UPDATE moods SET name = ?, emoji = ?, color = ? WHERE id = ?',
      args: [name, emoji, color, moodId]
    });

    const updated = await selectMoodById(moodId);

    return res.status(200).json({
      success: true,
      data: updated,
      message: 'Mood berhasil diperbarui'
    });
  })
);

// DELETE /api/moods/:id (auth)
router.delete('/:id', authMiddleware, asyncHandler(async (req, res) => {
  const moodId = Number(req.params.id);
  const existing = await selectMoodById(moodId);

  if (!existing) {
    return res.status(404).json({
      success: false,
      data: null,
      message: MOOD_NOT_FOUND_MSG,
      errors: []
    });
  }

  const usageResult = await db.execute({
    sql: 'SELECT COUNT(*) as count FROM entries WHERE mood_id = ?',
    args: [moodId]
  });
  const usageCount = usageResult.rows[0]?.count || 0;

  if (usageCount > 0) {
    return res.status(409).json({
      success: false,
      data: null,
      message: 'Mood tidak dapat dihapus karena masih digunakan oleh entri jurnal',
      errors: []
    });
  }

  await db.execute({ sql: 'DELETE FROM moods WHERE id = ?', args: [moodId] });

  return res.status(200).json({
    success: true,
    data: { id: moodId },
    message: 'Mood berhasil dihapus'
  });
}));

module.exports = router;
