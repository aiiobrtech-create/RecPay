import "fastify";

declare module "fastify" {
  interface FastifyRequest {
    /** Preenchido pelo `dashboardTenantPreHandler` quando a autenticação do dashboard está ativa. */
    dashboardEffectiveTenantId?: string;
    /** Papel na conta após `assertTenantManagementAccess` (sessão). */
    tenantMembershipRole?: "owner" | "admin" | "member" | "readonly";
    /** `true` quando o pedido usou `x-admin-token` válido (operação interna). */
    tenantAccessViaAdminToken?: boolean;
  }
}
