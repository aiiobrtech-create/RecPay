import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

export type DbClient = ReturnType<typeof drizzle<typeof schema>>;

/**
 * Cliente Postgres (Supabase pooler ou conexão direta).
 * Use uma instância por processo; em serverless, considerar factory por request conforme doc do provedor.
 */
function isSupabasePoolerHost(url: string): boolean {
  try {
    const u = new URL(url.replace(/^postgres:\/\//, "postgresql://"));
    return /pooler\.supabase\.com$/i.test(u.hostname);
  } catch {
    return false;
  }
}

export function createDb(databaseUrl: string): DbClient {
  const pooler = isSupabasePoolerHost(databaseUrl);
  const client = postgres(databaseUrl, {
    max: 10,
    prepare: false,
    ...(pooler ? { ssl: "require" as const } : {}),
  });
  return drizzle(client, { schema });
}
