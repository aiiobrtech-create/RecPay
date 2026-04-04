import "fastify";

declare module "fastify" {
  interface FastifyRequest {
    /** Preenchido pelo `dashboardTenantPreHandler` quando a autenticação do dashboard está ativa. */
    dashboardEffectiveTenantId?: string;
    /** Usuário autenticado da sessão do painel. */
    dashboardUserId?: string;
    /** Email do usuário autenticado da sessão do painel, quando houver. */
    dashboardUserEmail?: string | null;
    /** `true` quando o usuário possui capacidade operacional global no painel. */
    dashboardHasOperationalAccess?: boolean;
    /** Papel na conta após `assertTenantManagementAccess` (sessão). */
    tenantMembershipRole?: "owner" | "admin" | "member" | "readonly";
    /** `true` quando o pedido usou `x-admin-token` válido (operação interna). */
    tenantAccessViaAdminToken?: boolean;
  }
}
