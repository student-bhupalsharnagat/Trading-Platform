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

    await pgDb.transaction(async (client) => {
      const statements = sql
        .split(/;\s*$/m)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      for (const stmt of statements) {
        if (stmt.startsWith('--') && !stmt.includes('\n')) continue;
        await client.query(stmt);
      }
    });

    console.log(`[Postgres] Applied migration: ${file}`);
  }
}

export const runMigrations = runTradingMigrations;
