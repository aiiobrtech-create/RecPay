import { config } from "dotenv";
import { resolve } from "node:path";
import postgres from "postgres";

config({ path: resolve(process.cwd(), ".env"), override: true });

let urlRaw = process.env.DATABASE_URL?.trim();
if (!urlRaw) {
  console.log("NO_DATABASE_URL");
  process.exit(1);
}
if (
  (urlRaw.startsWith('"') && urlRaw.endsWith('"')) ||
  (urlRaw.startsWith("'") && urlRaw.endsWith("'"))
) {
  urlRaw = urlRaw.slice(1, -1);
}

/** Colchetes na string de ligação do Supabase costumam ser placeholder — não fazem parte da password. */
function passwordPlaceholderHint(password) {
  if (password === undefined || password === "") {
    return "A password na URI está vazia (o par user:password@host está mal).";
  }
  const p = password.trim();
  if (/^\[[^\]]+\]$/.test(p)) {
    return "A password na URI está entre [ e ]. Isso NÃO é válido: costuma ser texto de exemplo. Remove os colchetes e mete só a senha real, ou usa o botão **Copy** no Connect (URI já completa).";
  }
  if (p.startsWith("[")) {
    return "A password começa com '['. Se copiaste algo tipo [YOUR-PASSWORD] ou [abc123], apaga os colchetes — só a senha conta.";
  }
  if (/YOUR[_-]?PASSWORD/i.test(p)) {
    return 'Substitui YOUR-PASSWORD pela senha real (o texto literal "YOUR-PASSWORD" não é a tua senha).';
  }
  return null;
}

let hostname = "";
let username = "";
let passwordDecoded = "";
let port = "";

try {
  const normalized = urlRaw.startsWith("postgres://")
    ? urlRaw.replace(/^postgres:\/\//, "postgresql://")
    : urlRaw;
  const u = new URL(normalized);
  hostname = u.hostname;
  username = decodeURIComponent(u.username);
  passwordDecoded = decodeURIComponent(u.password);
  port = u.port || (u.protocol === "postgresql:" ? "5432" : "");
} catch {
  console.log("DB_FAIL invalid_url");
  process.exit(1);
}

const hint = passwordPlaceholderHint(passwordDecoded);
if (hint) {
  console.error("");
  console.error("PROBLEMA PROVÁVEL:", hint);
  console.error("");
}

const isSupabasePooler = /pooler\.supabase\.com$/i.test(hostname);
if (isSupabasePooler && port && port !== "6543") {
  console.warn(
    `Aviso: pooler Transaction do Supabase costuma usar porta 6543; tu usas ${port}. Confirma no Connect.`,
  );
}

console.info(
  "Ligação:",
  `user="${username}"`,
  `host=${hostname}`,
  `port=${port || "default"}`,
  isSupabasePooler ? "(pooler Supabase — SSL exigido)" : "",
);

const sql = postgres(urlRaw, {
  max: 1,
  connect_timeout: 15,
  prepare: false,
  ...(isSupabasePooler ? { ssl: "require" } : {}),
});

try {
  await sql`select 1 as ok`;
  console.log("DB_OK");
} catch (e) {
  const code = e.code ?? e.message;
  console.log("DB_FAIL", code);

  if (code === "28P01") {
    console.error("");
    console.error("28P01 = palavra-passe ou utilizador recusados pelo Postgres.");
    if (hint) {
      console.error("Repara no aviso em cima sobre colchetes / placeholder.");
    } else {
      console.error("");
      console.error("Checklist:");
      console.error(
        '  • No Supabase: Connect → **Transaction** → **Copy** (URI completa, sem editar [YOUR-PASSWORD]).',
      );
      console.error("  • No .env: evita aspas à volta da URI: DATABASE_URL=postgresql://...");
      console.error("  • Senha com caracteres especiais: npm run compose:database-url");
      console.error("  • Reset password e copiar **só** a URI nova do Connect.");
    }
  }
  process.exit(1);
} finally {
  await sql.end({ timeout: 2 });
}
