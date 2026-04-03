/**
 * Valores padrão quando variáveis de ambiente não estão definidas.
 * Altere aqui o "nome provisório" do produto; em produção prefira .env (ver COMO_RENOMEAR.md).
 */
export const APP_DEFAULTS = {
  /** Identificador estável para logs, métricas e filenames (slug, sem espaços). */
  id: "recovery-engine-dev",
  /** Nome exibível para humanos (interface, e-mails no futuro). */
  displayName: "Recovery Engine",
  /** Slug para URLs e subdomínios futuros; minúsculo, hífen. */
  slug: "recovery-engine",
} as const;
