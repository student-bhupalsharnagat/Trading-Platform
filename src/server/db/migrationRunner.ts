import fs from 'fs';
import path from 'path';
import { pgDb } from './postgres.ts';

export async function runTradingMigrations(): Promise<void> {
  await pgDb.init();

  const migrationsDir = path.join(process.cwd(), 'src/server/db/migrations');
  if (!fs.existsSync(migrationsDir)) {
    throw new Error(`Migrations directory not found at ${migrationsDir}`);
  }

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const filePath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(filePath, 'utf8');

    // Remove SQL single-line comments before splitting by semicolon
    const cleanedSql = sql
      .split('\n')
      .map((line) => {
        const commentIdx = line.indexOf('--');
        return commentIdx >= 0 ? line.substring(0, commentIdx) : line;
      })
      .join('\n');

    const statements = cleanedSql
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    await pgDb.transaction(async (client) => {
      for (const stmt of statements) {
        await client.query(stmt);
      }
    });

    console.log(`[Postgres] Applied migration: ${file}`);
  }
}

export const runMigrations = runTradingMigrations;
