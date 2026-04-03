import { createDb, sql, type DbClient } from "@re/db";

let _db: DbClient | null = null;

export function getDb(): DbClient | null {
  const url = process.env.DATABASE_URL;
  if (!url?.trim()) return null;
  if (!_db) _db = createDb(url);
  return _db;
}

export async function checkDatabase(): Promise<boolean> {
  const db = getDb();
  if (!db) return false;
  try {
    await db.execute(sql`select 1`);
    return true;
  } catch {
    return false;
  }
}
