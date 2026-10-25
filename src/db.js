const fs = require('node:fs');
const path = require('node:path');
const { createClient } = require('@libsql/client');
const { seedDatabase } = require('./seed');

const schemaPath = path.join(__dirname, 'schema.sql');
const schemaSql = fs.readFileSync(schemaPath, 'utf-8');

if (!process.env.TURSO_DATABASE_URL) {
  throw new Error('TURSO_DATABASE_URL wajib diatur sebelum backend dijalankan');
}

const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN
});

db.ready = initializeDatabase();

async function initializeDatabase() {
  await db.executeMultiple(schemaSql);
  await seedDatabase(db);
}

module.exports = db;
