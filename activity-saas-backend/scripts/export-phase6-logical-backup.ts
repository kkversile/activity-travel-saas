import { PrismaClient } from '@prisma/client';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';

const quote = (value: unknown) => { if (value === null || value === undefined) return 'NULL'; if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE'; if (typeof value === 'number' || typeof value === 'bigint') return String(value); const text = value instanceof Date ? value.toISOString() : Buffer.isBuffer(value) ? `\\x${value.toString('hex')}` : typeof value === 'object' ? JSON.stringify(value) : String(value); return `'${text.replace(/'/g, "''")}'`; };
async function main() {
  const prisma = new PrismaClient(); const output = join(process.cwd(), 'backups', 'phase6-postgresql18-logical-data-20260911.sql'); await mkdir(join(process.cwd(), 'backups'), { recursive: true });
  try {
    const tables = await prisma.$queryRawUnsafe<Array<{ table_name: string }>>(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name <> '_prisma_migrations' ORDER BY table_name`);
    const chunks = ['-- Voya Phase 6 logical data backup queried from PostgreSQL 18.6 using Prisma.', 'BEGIN;'];
    for (const table of tables) { const columns = await prisma.$queryRawUnsafe<Array<{ column_name: string }>>(`SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position`, table.table_name); const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(`SELECT * FROM "public"."${table.table_name.replace(/"/g, '""')}"`); if (!rows.length) continue; const names = columns.map((column) => `"${column.column_name.replace(/"/g, '""')}"`).join(', '); for (const row of rows) chunks.push(`INSERT INTO "public"."${table.table_name.replace(/"/g, '""')}" (${names}) VALUES (${columns.map((column) => quote(row[column.column_name])).join(', ')});`); }
    chunks.push('COMMIT;', ''); await writeFile(output, chunks.join('\n'), 'utf8'); console.log(JSON.stringify({ output, tables: tables.length }, null, 2));
  } finally { await prisma.$disconnect(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
