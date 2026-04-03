/**
 * Lista quantas linhas DATABASE_URL existem no .env (duplicadas são fonte de confusão).
 * npm run audit:env
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const p = resolve(process.cwd(), ".env");
if (!existsSync(p)) {
  console.error(".env não encontrado na raiz");
  process.exit(1);
}

const text = readFileSync(p, "utf8");
const lines = text.split(/\r?\n/);
const hits = [];
for (let i = 0; i < lines.length; i += 1) {
  if (/^\s*DATABASE_URL\s*=/.test(lines[i])) {
    hits.push({ num: i + 1, preview: lines[i].slice(0, 72) });
  }
}

console.info("Linhas com DATABASE_URL no .env:", hits.length);
for (const h of hits) {
  console.info(`  linha ${h.num}: ${h.preview}${h.preview.length >= 72 ? "…" : ""}`);
}
if (hits.length > 1) {
  console.error("");
  console.error("AVISO: há mais do que uma definição. Deixa só UMA linha DATABASE_URL=...");
}
if (hits.length === 0) {
  console.error("Nenhuma DATABASE_URL encontrada.");
}
