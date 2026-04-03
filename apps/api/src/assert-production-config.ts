import { isDashboardAuthEnforced } from "./auth/dashboard-auth.js";
import { isProductionLike } from "./lib/production-env.js";

/**
 * Em produção, o painel não pode ficar em modo legado (?tenantId= sem Bearer).
 * Falha de arranque explícita (evita deploy inseguro na VPS).
 */
export function assertProductionDashboardAuthRequired(): void {
  if (!isProductionLike()) return;
  if (isDashboardAuthEnforced()) return;
  console.error(
    "[api] Em produção (NODE_ENV=production ou API_ENV=production) é obrigatório DASHBOARD_AUTH_REQUIRED=true (e VITE_DASHBOARD_AUTH_REQUIRED=true no front). " +
      "Modo legado sem Bearer expõe dados de qualquer tenant via ?tenantId=. Veja INICIAR.md e PROJETO.md.",
  );
  process.exit(1);
}
