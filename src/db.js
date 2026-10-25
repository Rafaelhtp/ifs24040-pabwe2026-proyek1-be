const fs = require('node:fs');
const path = require('node:path');
const { createClient } = require('@libsql/client');
const { seedDatabase } = require('./seed');

const schemaPath = path.join(__dirname, 'schema.sql');
const schemaSql = fs.readFileSync(schemaPath, 'utf-8');

const dbUrl = process.env.TURSO_DATABASE_URL
  ? process.env.TURSO_DATABASE_URL.trim()
  : null;

if (!dbUrl) {
  throw new Error('TURSO_DATABASE_URL wajib diatur sebelum backend dijalankan');
}

const db = createClient({
  url: dbUrl,
  authToken: process.env.TURSO_AUTH_TOKEN
    ? process.env.TURSO_AUTH_TOKEN.trim()
    : undefined
});

db.ready = initializeDatabase();

async function initializeDatabase() {
  await db.executeMultiple(schemaSql);
  await seedDatabase(db);
}

module.exports = db;
