/**
 * Um comando para desenvolvimento local:
 * - Redis via Docker se REDIS_URL apontar para localhost
 * - espera a porta Redis
 * - opcional: AUTO_DB_SYNC=1 → db:push + db:rls (falhas são avisadas; API/worker sobem na mesma)
 * - API + worker + web em paralelo (concurrently)
 */
import { config } from "dotenv";
import { spawn, execSync } from "node:child_process";
import { createConnection } from "node:net";
import { resolve } from "node:path";

config({ path: resolve(process.cwd(), ".env"), override: true });

function parseRedisTarget(redisUrlRaw) {
  const fallback = "redis://127.0.0.1:6379";
  const raw = redisUrlRaw?.trim() || fallback;
  let u;
  try {
    u = new URL(raw);
  } catch {
    u = new URL(fallback);
  }
  const port = u.port ? Number(u.port) : 6379;
  return { host: u.hostname || "127.0.0.1", port: Number.isFinite(port) ? port : 6379 };
}

function waitPort(host, port, timeoutMs = 90_000) {
  const start = Date.now();
  return new Promise((res, rej) => {
    const attempt = () => {
      const sock = createConnection({ host, port }, () => {
        sock.end();
        res();
      });
      sock.on("error", () => {
        sock.destroy();
        if (Date.now() - start > timeoutMs) {
          rej(new Error(`Timeout à espera de ${host}:${port}`));
        } else {
          setTimeout(attempt, 400);
        }
      });
    };
    attempt();
  });
}

function runNpm(scriptArgs, label) {
  try {
    execSync(`npm ${scriptArgs}`, { stdio: "inherit", cwd: process.cwd(), shell: true });
  } catch (e) {
    console.warn(`[dev-stack] Aviso: "${label}" falhou. Corrija rede/.env e tente de novo.`, e.message ?? e);
  }
}

const { host, port } = parseRedisTarget(process.env.REDIS_URL);
const isLocalRedis =
  host === "127.0.0.1" || host === "localhost" || host === "::1";

if (isLocalRedis) {
  try {
    execSync("docker compose up -d", { stdio: "inherit", cwd: process.cwd(), shell: true });
  } catch {
    console.warn(
      "[dev-stack] Docker não subiu o Redis (Docker a correr?). Se usas Redis noutro sítio, define REDIS_URL com esse host.",
    );
  }
}

console.info(`[dev-stack] À espera de Redis em ${host}:${port}…`);
try {
  await waitPort(host, port);
  console.info("[dev-stack] Redis pronto.");
} catch (e) {
  console.error("[dev-stack]", e.message ?? e);
  process.exit(1);
}

/** Por omissão corre db:push + db:rls antes da API. Use AUTO_DB_SYNC=0 no .env para saltar. */
const syncDb = process.env.AUTO_DB_SYNC !== "0";
if (syncDb) {
  console.info("[dev-stack] Sincronizar DB (db:push + db:rls)… — AUTO_DB_SYNC=0 para desligar");
  runNpm("run db:push -w @re/db", "db:push");
  runNpm("run db:rls", "db:rls");
}

/** No Windows, spawn + shell com vários args quebra `npm run dev` dentro do concurrently (cmd trata `run`/`dev` como comandos). */
const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const concurrentlyLine = [
  npx,
  "concurrently",
  "-k",
  "-n",
  "api,worker,web",
  "-c",
  "blue,magenta,cyan",
  '"npm run dev -w @re/api"',
  '"npm run dev -w @re/worker"',
  '"npm run dev -w @re/web"',
].join(" ");

const child = spawn(concurrentlyLine, {
  stdio: "inherit",
  shell: true,
  cwd: process.cwd(),
  env: process.env,
});

child.on("exit", (code) => process.exit(code ?? 0));
