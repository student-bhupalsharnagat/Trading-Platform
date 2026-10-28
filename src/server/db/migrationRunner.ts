import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pgDb } from './postgres.ts';

function resolveMigrationsDir(): string {
  const currentDir = typeof __dirname !== 'undefined' ? __dirname : process.cwd();

  const candidates = [
    path.resolve(currentDir, 'migrations'),
    path.resolve(currentDir, 'src', 'server', 'db', 'migrations'),
    path.join(process.cwd(), 'src', 'server', 'db', 'migrations'),
    path.join(process.cwd(), 'trading-platform', 'src', 'server', 'db', 'migrations'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return path.resolve(currentDir, 'migrations');
}

export async function runTradingMigrations(): Promise<void> {
  await pgDb.init();

  const migrationsDir = resolveMigrationsDir();
  if (!fs.existsSync(migrationsDir)) {
    throw new Error(`Migrations directory not found at ${migrationsDir}`);
  }

  // 1. Ensure schema migration tracker exists
  await pgDb.query(`
    CREATE TABLE IF NOT EXISTS trading_schema_migrations (
      version VARCHAR(255) PRIMARY KEY,
      applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const { rows: appliedRows } = await pgDb.query<{ version: string }>(
    'SELECT version FROM trading_schema_migrations'
  );
  const appliedSet = new Set(appliedRows.map((r) => r.version));

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql') && !f.endsWith('.down.sql') && !f.endsWith('.rollback.sql'))
    .sort();

  console.log(`[Postgres Migrations] Found ${files.length} migration files (${appliedSet.size} previously applied).`);

  for (const file of files) {
    if (appliedSet.has(file)) {
      continue;
    }

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

    const hasConcurrent = statements.some((s) => s.toUpperCase().includes('CONCURRENTLY'));

    if (hasConcurrent) {
      for (const stmt of statements) {
        await pgDb.query(stmt);
      }
      await pgDb.query(
        'INSERT INTO trading_schema_migrations (version) VALUES ($1) ON CONFLICT (version) DO NOTHING',
        [file]
      );
    } else {
      await pgDb.transaction(async (client) => {
        for (const stmt of statements) {
          await client.query(stmt);
        }
        await client.query(
          'INSERT INTO trading_schema_migrations (version) VALUES ($1) ON CONFLICT (version) DO NOTHING',
          [file]
        );
      });
    }

    console.log(`[Postgres Migrations] Successfully applied migration: ${file}`);
  }
}

export const runMigrations = runTradingMigrations;
