import assert from "node:assert/strict";
import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(process.cwd(), ".env"), override: true });

const apiPort = process.env.API_PORT?.trim() || "3000";
const baseUrl = process.env.SMOKE_API_BASE_URL?.trim() || `http://127.0.0.1:${apiPort}`;
const tenantId = process.env.SMOKE_TENANT_ID?.trim() || "";
const accessToken = process.env.SMOKE_ACCESS_TOKEN?.trim() || "";

async function getJson(url, headers = {}) {
  const response = await fetch(url, {
    method: "GET",
    headers: { accept: "application/json", ...headers },
  });
  const body = await response.json().catch(() => ({}));
  return { status: response.status, body };
}

let skipReason = "";

try {
  const health = await getJson(`${baseUrl}/health`);
  assert.equal(health.status, 200, "health deve responder 200");
  assert.equal(health.body?.ok, true, "health.ok deve ser true");

  if (!tenantId) {
    skipReason = "SMOKE_DASHBOARD_SKIP (defina SMOKE_TENANT_ID para validar /recovery-attempts/summary)";
  }

  if (!skipReason) {
    const authHeaders = accessToken ? { authorization: `Bearer ${accessToken}` } : {};
    const summary = await getJson(
      `${baseUrl}/recovery-attempts/summary?tenantId=${encodeURIComponent(tenantId)}`,
      authHeaders,
    );

    if ((summary.status === 401 || summary.status === 403) && !accessToken) {
      skipReason =
        "SMOKE_DASHBOARD_SKIP (API com auth de dashboard ativa: defina SMOKE_ACCESS_TOKEN com JWT válido para o tenant)";
    } else {
      assert.equal(summary.status, 200, "summary deve responder 200");
      assert.equal(summary.body?.ok, true, "summary.ok deve ser true");
      assert.equal(
        summary.body?.tenantId,
        tenantId,
        "summary.tenantId deve corresponder ao tenant solicitado",
      );
      assert.ok(summary.body?.totals, "summary.totals deve existir");
      assert.ok(summary.body?.byStatus, "summary.byStatus deve existir");
    }
  }

  if (skipReason) {
    console.log(skipReason);
  } else {
    console.log("SMOKE_DASHBOARD_API_OK");
  }
} catch (error) {
  console.error("SMOKE_DASHBOARD_API_FAIL", error instanceof Error ? error.message : error);
  process.exit(1);
}
