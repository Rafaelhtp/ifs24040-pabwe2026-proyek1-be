// Route untuk statistik mingguan (7 hari terakhir) milik user yang sedang login
const express = require('express');
const db = require('../db');
const { authMiddleware, asyncHandler } = require('../middleware');
const { formatRelativeDate } = require('../seed');

const router = express.Router();

function roundTwoDecimals(value) {
  if (!value) return 0;
  return Number(Number(value).toFixed(2));
}

// GET /api/stats/weekly
router.get('/weekly', authMiddleware, asyncHandler(async (req, res) => {
  const userId = req.user?.id;

  // Buat daftar tanggal 7 hari terakhir (dari 6 hari lalu sampai hari ini)
  const last7Days = [];
  for (let i = 6; i >= 0; i -= 1) {
    last7Days.push(formatRelativeDate(i));
  }
  const startDate = last7Days[0];
  const endDate = last7Days.at(-1);

  // Total entri dan rata-rata energi dalam 7 hari terakhir
  const summaryResult = await db.execute({
    sql: `
      SELECT
        COUNT(*) AS total_entries,
        AVG(energy_level) AS avg_energy
      FROM entries
      WHERE user_id = ? AND entry_date BETWEEN ? AND ?
    `,
    args: [userId, startDate, endDate]
  });
  const summaryRow = summaryResult.rows[0];

  const totalEntries7d = summaryRow?.total_entries || 0;
  const avgEnergy7d = roundTwoDecimals(summaryRow?.avg_energy);

  // Distribusi per mood dalam 7 hari terakhir
  const byMoodResult = await db.execute({
    sql: `
      SELECT
        m.id AS mood_id,
        m.name,
        m.emoji,
        m.color,
        COUNT(e.id) AS count
      FROM entries e
      JOIN moods m ON e.mood_id = m.id
      WHERE e.user_id = ? AND entry_date BETWEEN ? AND ?
      GROUP BY m.id, m.name, m.emoji, m.color
      ORDER BY count DESC, m.id ASC
    `,
    args: [userId, startDate, endDate]
  });
  const byMoodRows = byMoodResult.rows;

  const topMood =
    byMoodRows.length > 0
      ? {
          id: byMoodRows[0].mood_id,
          name: byMoodRows[0].name,
          emoji: byMoodRows[0].emoji,
          color: byMoodRows[0].color,
          count: byMoodRows[0].count
        }
      : null;

  // Statistik harian untuk 7 hari terakhir (hari kosong tetap muncul dengan count 0)
  const dailyResult = await db.execute({
    sql: `
      SELECT
        entry_date AS date,
        COUNT(*) AS count,
        AVG(energy_level) AS avg_energy
      FROM entries
      WHERE user_id = ? AND entry_date BETWEEN ? AND ?
      GROUP BY entry_date
    `,
    args: [userId, startDate, endDate]
  });
  const dailyRows = dailyResult.rows;

  const dailyMap = {};
  for (const row of dailyRows) {
    dailyMap[row.date] = {
      date: row.date,
      count: row.count,
      avg_energy: roundTwoDecimals(row.avg_energy)
    };
  }

  const daily = last7Days.map(
    (dateStr) =>
      dailyMap[dateStr] || {
        date: dateStr,
        count: 0,
        avg_energy: 0
      }
  );

  return res.status(200).json({
    success: true,
    data: {
      total_entries_7d: totalEntries7d,
      avg_energy_7d: avgEnergy7d,
      top_mood: topMood,
      by_mood: byMoodRows,
      daily
    },
    message: 'Statistik mingguan berhasil diambil'
  });
}));

module.exports = router;
