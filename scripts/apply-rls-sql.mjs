/**
 * Aplica os ficheiros SQL em packages/db/sql pela ordem numérica, usando DATABASE_URL.
 * Uso na raiz: npm run db:rls
 */
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "dotenv";
import postgres from "postgres";

config({ path: resolve(process.cwd(), ".env"), override: true });

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  console.error("DATABASE_URL ausente no .env");
  process.exit(1);
}

const sqlDir = resolve(process.cwd(), "packages/db/sql");
const files = readdirSync(sqlDir)
  .filter((f) => f.endsWith(".sql"))
  .sort();

if (files.length === 0) {
  console.error("Nenhum .sql em packages/db/sql");
  process.exit(1);
}

function splitStatements(src) {
  const statements = [];
  let buf = "";
  let inSingle = false;
  let inDouble = false;
  let inLineComment = false;
  let dollarTag = null;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    const next = src[i + 1];

    if (inLineComment) {
      if (ch === "\n") {
        inLineComment = false;
        buf += ch;
      }
      continue;
    }

    if (dollarTag) {
      if (src.startsWith(dollarTag, i)) {
        buf += dollarTag;
        i += dollarTag.length - 1;
        dollarTag = null;
      } else {
        buf += ch;
      }
      continue;
    }

    if (inSingle) {
      buf += ch;
      if (ch === "'" && next === "'") {
        buf += next;
        i++;
      } else if (ch === "'") {
        inSingle = false;
      }
      continue;
    }

    if (inDouble) {
      buf += ch;
      if (ch === '"' && next === '"') {
        buf += next;
        i++;
      } else if (ch === '"') {
        inDouble = false;
      }
      continue;
    }

    if (ch === "-" && next === "-") {
      inLineComment = true;
      i++;
      continue;
    }

    if (ch === "'") {
      inSingle = true;
      buf += ch;
      continue;
    }

    if (ch === '"') {
      inDouble = true;
      buf += ch;
      continue;
    }

    if (ch === "$") {
      const rest = src.slice(i);
      const match = rest.match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/);
      if (match) {
        dollarTag = match[0];
        buf += dollarTag;
        i += dollarTag.length - 1;
        continue;
      }
    }

    if (ch === ";") {
      const stmt = buf.trim();
      if (stmt) statements.push(stmt);
      buf = "";
      continue;
    }

    buf += ch;
  }

  const tail = buf.trim();
  if (tail) statements.push(tail);
  return statements;
}

const client = postgres(databaseUrl, { max: 1 });

try {
  for (const file of files) {
    const path = resolve(sqlDir, file);
    const body = readFileSync(path, "utf8");
    const stmts = splitStatements(body);
    console.info(`→ ${file} (${stmts.length} statement(s))`);
    for (const stmt of stmts) {
      await client.unsafe(`${stmt};`);
    }
  }
  console.info("RLS/SQL aplicados com sucesso.");
} catch (e) {
  console.error("Falha ao aplicar SQL:", e.message ?? e);
  process.exit(1);
} finally {
  await client.end({ timeout: 5 });
}
