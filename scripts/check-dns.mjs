/**
 * Resolve o hostname de DATABASE_URL (sem ligar ao Postgres).
 * Uso: npm run check:dns
 */
import dns from "node:dns/promises";
import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(process.cwd(), ".env"), override: true });

const urlRaw = process.env.DATABASE_URL?.trim();
if (!urlRaw) {
  console.error("DATABASE_URL ausente no .env");
  process.exit(1);
}

let hostname;
try {
  const normalized = urlRaw.startsWith("postgres://")
    ? urlRaw.replace(/^postgres:\/\//, "postgresql://")
    : urlRaw;
  hostname = new URL(normalized).hostname;
} catch {
  console.error("DATABASE_URL não parece uma URI válida (postgresql://... ou postgres://...).");
  process.exit(1);
}

console.info("Hostname:", hostname);

try {
  const r = await dns.lookup(hostname);
  console.info("DNS_OK →", r.address, `(family ${r.family})`);
} catch (e) {
  console.error("DNS_FAIL →", e.code ?? e.message);
  console.error("");
  console.error("Isto indica que este PC não conseguiu resolver o nome (DNS/rede), não que a senha esteja errada.");

  const direct = /^db\.([a-z0-9-]+)\.supabase\.co$/i.exec(hostname);
  if (direct) {
    console.error("");
    console.error("Detetado host DIRECT do Supabase:", hostname);
    console.error("Project ref:", direct[1]);
    console.error("");
    console.error("Substitui a DATABASE_URL por uma URI do POOLER (Transaction):");
    console.error("  1. Dashboard → o teu projeto → Project Settings (ícone roda dentada)");
    console.error("  2. Database → secção Connection string (ou Connect)");
    console.error("  3. Type: URI — escolhe método / Mode: Transaction pooler (porta 6543)");
    console.error("  4. O host deve ser parecido com: aws-0-REGIAO.pooler.supabase.com");
    console.error("  5. O utilizador pode ser postgres.SEU_REF (copia exatamente o que o painel mostra)");
    console.error("  6. Cola a linha inteira em DATABASE_URL no .env e grava o ficheiro");
    console.error("  7. Volta a correr: npm run check:dns");
  } else {
    console.error("");
    console.error("- Confirma no Supabase que copiaste a URI do Transaction pooler (6543).");
    console.error("- PowerShell: nslookup", hostname);
    console.error("- Teste: ipconfig /flushdns, VPN desligada, outra rede (hotspot).");
  }
  process.exit(1);
}
