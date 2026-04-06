import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DashboardOverviewHttpError, useDashboardOverview } from "@re/frontend";
import { ArrowsClockwise, Bell, ChatCircleText, ClockCounterClockwise, DotsThreeOutlineVertical, MagnifyingGlass, Plus, SlidersHorizontal, UserCircle } from "@phosphor-icons/react";
import { AuthGateChrome } from "./AuthGateChrome.js";
import { dashboardFetch, readResponseJson } from "./dashboard-fetch.js";
import { composeRecoveryMessagePreview, RECOVERY_PLACEHOLDER_CLIPBOARD_ITEMS } from "./recovery-message-preview.js";
import { isSupabaseBrowserConfigured, supabase } from "./supabase-client.js";

function formatPercent(v: number | null): string {
  if (v === null) return "-";
  return new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1 }).format(v);
}

function formatInt(v: number | null): string {
  if (v === null) return "-";
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(v);
}

function formatCurrencyBrl(v: number | null): string {
  if (v === null) return "R$ 0,00";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 }).format(v);
}

function formatDate(input: string): string {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" }).format(new Date(input));
}

function formatDateTime(input: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(input));
}

function formatUsageRatio(used: number, limit: number | null, unlimited: boolean): string {
  if (unlimited || limit == null) return `${formatInt(used)} / ilimitado`;
  return `${formatInt(used)} / ${formatInt(limit)}`;
}

function buildAttemptLogPageList(current: number, total: number): Array<number | "gap"> {
  if (total <= 0) return [];
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const set = new Set<number>();
  set.add(1);
  set.add(total);
  set.add(current);
  if (current > 1) set.add(current - 1);
  if (current < total) set.add(current + 1);
  const sorted = [...set].sort((a, b) => a - b);
  const out: Array<number | "gap"> = [];
  for (let i = 0; i < sorted.length; i += 1) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) {
      out.push("gap");
    }
    out.push(sorted[i]);
  }
  return out;
}

function startOfMonthIso(): string {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
  return d.toISOString();
}

function endOfDayIso(): string {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
  return d.toISOString();
}

function normalizeDateInputToIso(input: string): string | null {
  const value = input.trim();
  if (!value) return null;

  const alreadyIso = new Date(value);
  if (!Number.isNaN(alreadyIso.getTime())) {
    return alreadyIso.toISOString();
  }

  const localDateTimePattern = /^(\d{4}-\d{2}-\d{2})[T\s](\d{2}:\d{2})(?::(\d{2}))?$/;
  const match = value.match(localDateTimePattern);
  if (!match) return null;

  const datePart = match[1];
  const timePart = match[2];
  const seconds = match[3] ?? "00";
  const localIsoLike = `${datePart}T${timePart}:${seconds}`;
  const localDate = new Date(localIsoLike);
  if (Number.isNaN(localDate.getTime())) return null;
  return localDate.toISOString();
}

function last7DaysIso(): { from: string; to: string } {
  const now = new Date();
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
  const from = new Date(to.getTime() - 6 * 24 * 60 * 60 * 1000);
  from.setUTCHours(0, 0, 0, 0);
  return { from: from.toISOString(), to: to.toISOString() };
}

function last30DaysIso(): { from: string; to: string } {
  const now = new Date();
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
  const from = new Date(to.getTime() - 29 * 24 * 60 * 60 * 1000);
  from.setUTCHours(0, 0, 0, 0);
  return { from: from.toISOString(), to: to.toISOString() };
}

function last90DaysIso(): { from: string; to: string } {
  const now = new Date();
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
  const from = new Date(to.getTime() - 89 * 24 * 60 * 60 * 1000);
  from.setUTCHours(0, 0, 0, 0);
  return { from: from.toISOString(), to: to.toISOString() };
}

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function normalizeTenantInput(value: string): string {
  return value.trim().replace(/^['"]+|['"]+$/g, "").toLowerCase();
}

function normalizeProviderKey(value: string): "hotmart" | "kiwify" | "hubla" | "generic" | "unknown" {
  const normalized = value.trim().toLowerCase();
  if (normalized.includes("hotmart")) return "hotmart";
  if (normalized.includes("kiwify")) return "kiwify";
  if (normalized.includes("hubla")) return "hubla";
  if (normalized.includes("generic") || normalized.includes("custom") || normalized.includes("personal")) {
    return "generic";
  }
  return "unknown";
}

function numberInputToNullable(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return null;
  return Math.trunc(parsed);
}

function isUuidV4Like(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

/** Resumo do identificador interno para exibição (evita expor o UUID completo na interface). */
function formatAccountIdForDisplay(id: string): string {
  const t = id.trim();
  if (!t) return "—";
  if (t.length <= 14) return t;
  return `${t.slice(0, 8)}…${t.slice(-4)}`;
}

function membershipRoleLabelPt(role: string | null | undefined): string {
  switch (role) {
    case "owner":
      return "Proprietário da conta";
    case "admin":
      return "Administrador";
    case "member":
      return "Membro";
    case "readonly":
      return "Somente leitura";
    default:
      return "—";
  }
}

/** Mensagem de erro a partir do JSON já lido (o corpo da Response só pode ser lido uma vez). */
function formatHttpError(fallback: string, response: Response, parsed: unknown): string {
  const o = parsed as { error?: string; message?: string } | null | undefined;
  const detail = o && typeof o === "object" ? o.message || o.error : undefined;
  if (typeof detail === "string" && detail.trim()) return `${fallback} (${detail})`;
  return `${fallback} (HTTP ${response.status})`;
}

/** Evita mensagem vazia quando há duas cópias de `@re/frontend` e `instanceof` falha. */
function isDashboardOverviewHttpErrorLike(error: unknown): error is DashboardOverviewHttpError {
  if (error instanceof DashboardOverviewHttpError) return true;
  if (typeof error !== "object" || error === null) return false;
  const e = error as { name?: unknown; status?: unknown };
  return e.name === "DashboardOverviewHttpError" && typeof e.status === "number";
}

function mapDashboardApiErrorCode(code: string): string | null {
  const c = code.trim();
  const map: Record<string, string> = {
    database_unavailable: "Banco de dados indisponível no servidor. Tente novamente em instantes.",
    tenant_not_found: "Conta não encontrada. Verifique o ID do tenant ou se o cadastro existe na API.",
    tenant_id_required: "Informe uma conta (tenant) nos filtros.",
    tenant_forbidden: "Sem permissão para acessar esta conta.",
    invalid_query: "Parâmetros da consulta inválidos.",
    invalid_range: "Intervalo de datas inválido.",
    range_too_large: "Período muito longo (máximo 120 dias).",
    unauthorized: "Sessão expirada ou não autorizado. Faça login novamente.",
    bearer_token_required: "É necessário estar autenticado para carregar o painel.",
    invalid_token: "Token inválido ou expirado. Faça login novamente.",
    no_tenant_membership: "Seu usuário não está vinculado a nenhuma conta.",
    auth_not_configured: "Autenticação do painel não configurada no servidor.",
    insufficient_role: "Seu papel não permite esta operação.",
    insufficient_operational_access: "Seu usuário não possui permissão operacional para acessar esta área.",
  };
  return map[c] ?? null;
}

function getDashboardErrorMessage(error: unknown, baseUrl: string): string {
  if (!isDashboardOverviewHttpErrorLike(error)) {
    if (error instanceof Error) {
      return "Não foi possível carregar os dados. Verifique sua conexão e tente novamente.";
    }
    return "Não foi possível carregar os dados. Tente novamente em instantes.";
  }

  const body = error.body as
    | {
        message?: string;
        error?: string;
        details?: string;
      }
    | null
    | undefined;

  if (typeof body?.error === "string" && body.error.trim()) {
    const mapped = mapDashboardApiErrorCode(body.error);
    if (mapped) return mapped;
  }

  const details = [body?.message, body?.error, body?.details].find(
    (value): value is string => Boolean(value && value.trim()),
  );

  if (details) {
    return details;
  }

  return `Não foi possível carregar o painel (HTTP ${error.status}). Confirme se a API está em ${baseUrl}, se GET /health responde e tente novamente.`;
}

function statusTone(status: "normal" | "warning" | "exceeded" | "unlimited"): string {
  if (status === "exceeded") return "danger";
  if (status === "warning") return "warning";
  if (status === "unlimited") return "neutral";
  return "success";
}

type TimeseriesSortKey = "day" | "events" | "recoveryAttempts";
type ThemeMode = "dark";
type SortDirection = "asc" | "desc";
type SideMenuKey = "dashboard" | "attempts" | "integrations" | "messages" | "operations" | "support" | "account" | "settings";
type WebhookProvider = "hotmart" | "kiwify" | "hubla" | "generic";
type ProviderKey = WebhookProvider;
type ProviderConfig = {
  enabled: boolean;
  apiKey: string;
  webhookToken: string;
  endpointUrl: string;
};

type ProviderFieldCopy = {
  apiKeyLabel: string;
  apiKeyPlaceholder: string;
  webhookTokenLabel: string;
  webhookTokenPlaceholder: string;
  missingFieldsMessage: string;
};

const REDACTED_PROVIDER_SECRET = "********";

interface SavedView {
  id: string;
  name: string;
  isFavorite: boolean;
  position: number;
  tenantId: string;
  from: string;
  to: string;
  warningThreshold: number;
  search: string;
  sortKey: TimeseriesSortKey;
  sortDirection: SortDirection;
  theme: ThemeMode;
}

interface ToastMessage {
  id: string;
  text: string;
  actionLabel?: string;
  onAction?: () => void;
}

interface DeletedViewSnapshot {
  deletionId: string;
  view: SavedView;
  wasDefault: boolean;
}

interface DashboardMessageTemplate {
  id: string;
  name: string;
  body: string;
  active: boolean;
  channel: string;
  updatedAt: string;
}

interface DashboardWhatsappFlow {
  id: string;
  name: string;
  triggerEventType: string;
  triggerLabel: string;
  messageTemplateId: string;
  enabled: boolean;
  priority: number;
}

interface DashboardMessageVariant {
  id: string;
  templateId: string;
  label: string;
  weight: number;
  body: string | null;
  active: boolean;
}

type RecoveryLinkApprovalStatus = "pending_review" | "approved" | "rejected";

interface DashboardMeTenant {
  id: string;
  name: string;
  role: string;
}

interface DashboardRecoveryLink {
  id: string;
  createdAt: string;
  updatedAt: string;
  tenantId: string;
  tenantName?: string | null;
  label: string;
  url: string;
  platform: string | null;
  triggerEventType: string | null;
  productName: string | null;
  active: boolean;
  priority: number;
  approvalStatus: RecoveryLinkApprovalStatus;
  approvalNote: string | null;
  submittedBy: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
}

type RecoveryLinkDraft = {
  label: string;
  url: string;
  platform: string;
  triggerEventType: string;
  productName: string;
  active: boolean;
  submittedBy: string;
};

type RecoveryLinkReviewDraft = {
  approvalNote: string;
};

type RecoveryLinksQueueSummary = {
  all: number;
  pendingReview: number;
  approved: number;
  rejected: number;
};

type RecoveryLinksQueuePagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

interface TriggerCatalogEntry {
  value: string;
  label: string;
}

interface TenantDashboardSettings {
  planMonthlyEventsLimit: number | null;
  planMonthlyRecoveryLimit: number | null;
  /** `essential` | `growth` | `scale` — espelho do Stripe/metadata; ajuste só com admin. */
  billingPlan: string | null;
  recoveryContactCooldownMinutes: number | null;
  recoveryContactMaxAttemptsPerDay: number | null;
  webhookProviderPreferred: WebhookProvider | null;
}

function emptyProviderConfig(endpointUrl = ""): ProviderConfig {
  return {
    enabled: false,
    apiKey: "",
    webhookToken: "",
    endpointUrl,
  };
}

function providerConfigHasRequiredFields(provider: ProviderKey, config: ProviderConfig | null | undefined): boolean {
  if (!config) return false;
  const apiKey = config.apiKey.trim();
  const webhookToken = config.webhookToken.trim();
  const hasEndpoint = Boolean(config.endpointUrl.trim());
  const hasApiKey = Boolean(apiKey);
  const hasWebhookToken = Boolean(webhookToken);
  if (provider === "hotmart") {
    return hasEndpoint;
  }
  if (provider === "kiwify" || provider === "hubla") {
    return Boolean(hasWebhookToken && hasEndpoint);
  }
  return Boolean(hasApiKey && hasWebhookToken && hasEndpoint);
}

function providerFieldCopy(provider: ProviderKey): ProviderFieldCopy {
  if (provider === "hotmart") {
    return {
      apiKeyLabel: "Segredo do webhook (opcional)",
      apiKeyPlaceholder: "Use apenas se a Hotmart enviar assinatura HMAC",
      webhookTokenLabel: "",
      webhookTokenPlaceholder: "",
      missingFieldsMessage: "Preencha o endereco antes de ativar.",
    };
  }
  if (provider === "kiwify") {
    return {
      apiKeyLabel: "",
      apiKeyPlaceholder: "",
      webhookTokenLabel: "Token de assinatura do webhook",
      webhookTokenPlaceholder: "Token fornecido pela plataforma",
      missingFieldsMessage: "Preencha token e endereco antes de ativar.",
    };
  }
  if (provider === "hubla") {
    return {
      apiKeyLabel: "",
      apiKeyPlaceholder: "",
      webhookTokenLabel: "Token de autenticacao do webhook",
      webhookTokenPlaceholder: "Token fornecido pela Hubla",
      missingFieldsMessage: "Confirme o token da Hubla e a URL de webhook gerada.",
    };
  }
  return {
    apiKeyLabel: "Chave da plataforma",
    apiKeyPlaceholder: "Cole a chave da plataforma",
    webhookTokenLabel: "Token de assinatura do webhook",
    webhookTokenPlaceholder: "Token fornecido pela plataforma",
    missingFieldsMessage: "Preencha chave, token e endereco antes de ativar.",
  };
}

function emptyRecoveryLinkDraft(): RecoveryLinkDraft {
  return {
    label: "",
    url: "",
    platform: "",
    triggerEventType: "",
    productName: "",
    active: true,
    submittedBy: "",
  };
}

function recoveryLinkToDraft(item: DashboardRecoveryLink): RecoveryLinkDraft {
  return {
    label: item.label,
    url: item.url,
    platform: item.platform ?? "",
    triggerEventType: item.triggerEventType ?? "",
    productName: item.productName ?? "",
    active: item.active,
    submittedBy: item.submittedBy ?? "",
  };
}

function recoveryLinkStatusLabel(status: RecoveryLinkApprovalStatus): string {
  switch (status) {
    case "approved":
      return "Aprovado";
    case "rejected":
      return "Rejeitado";
    default:
      return "Pendente de revisão";
  }
}

function recoveryLinkStatusTone(status: RecoveryLinkApprovalStatus): "success" | "warning" | "danger" {
  switch (status) {
    case "approved":
      return "success";
    case "rejected":
      return "danger";
    default:
      return "warning";
  }
}

function emptyRecoveryLinkReviewDraft(): RecoveryLinkReviewDraft {
  return {
    approvalNote: "",
  };
}

function emptyRecoveryLinksQueueSummary(): RecoveryLinksQueueSummary {
  return {
    all: 0,
    pendingReview: 0,
    approved: 0,
    rejected: 0,
  };
}

function emptyRecoveryLinksQueuePagination(): RecoveryLinksQueuePagination {
  return {
    page: 1,
    pageSize: 12,
    total: 0,
    totalPages: 1,
  };
}

type DropdownOption<TValue extends string> = {
  value: TValue | "";
  label: string;
};

const SAVED_VIEWS_KEY = "re_dashboard_views_v1";
const DEFAULT_VIEW_KEY = "re_dashboard_default_view_v1";

export function App() {
  const initialTenantId = (import.meta.env.VITE_TENANT_ID ?? import.meta.env.VITE_SMOKE_TENANT_ID ?? "").trim();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isViewsModalOpen, setIsViewsModalOpen] = useState(false);
  const [isViewConfigOpen, setIsViewConfigOpen] = useState(false);
  const [activeMenu, setActiveMenu] = useState<SideMenuKey>("dashboard");
  const [draggingViewId, setDraggingViewId] = useState("");
  const [pendingDeleteViewId, setPendingDeleteViewId] = useState("");
  const [viewsSearch, setViewsSearch] = useState("");
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [lastDeletedView, setLastDeletedView] = useState<DeletedViewSnapshot | null>(null);
  const theme: ThemeMode = "dark";
  const [tenantId, setTenantId] = useState(initialTenantId);
  const [search, setSearch] = useState("");
  const [viewName, setViewName] = useState("");
  const [selectedViewId, setSelectedViewId] = useState("");
  const [defaultViewId, setDefaultViewId] = useState("");
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [viewsHydrated, setViewsHydrated] = useState(false);
  const [autoAppliedDefault, setAutoAppliedDefault] = useState(false);
  const [warningThreshold, setWarningThreshold] = useState(0.8);
  const [from, setFrom] = useState(() => {
    const range = last30DaysIso();
    return range.from;
  });
  const [to, setTo] = useState(endOfDayIso());
  const [sortKey, setSortKey] = useState<TimeseriesSortKey>("day");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [page, setPage] = useState(1);
  const [attemptLogPage, setAttemptLogPage] = useState(1);
  const [attemptLogSearch, setAttemptLogSearch] = useState("");
  const [attemptLogRange, setAttemptLogRange] = useState<"7" | "30" | "90" | "all">("all");
  const [isAttemptRangeOpen, setIsAttemptRangeOpen] = useState(false);
  const attemptRangeRef = useRef<HTMLDivElement | null>(null);
  const [pageSize, setPageSize] = useState(10);
  const [submittedTenantId, setSubmittedTenantId] = useState(initialTenantId);
  const attemptsTenantId = useMemo(() => {
    const normalizedTenant = normalizeTenantInput(tenantId);
    if (isUuidV4Like(normalizedTenant)) return normalizedTenant;
    const normalizedSubmitted = normalizeTenantInput(submittedTenantId);
    return isUuidV4Like(normalizedSubmitted) ? normalizedSubmitted : "";
  }, [submittedTenantId, tenantId]);
  const [submittedFrom, setSubmittedFrom] = useState(() => {
    const range = last30DaysIso();
    return range.from;
  });
  const [submittedTo, setSubmittedTo] = useState(endOfDayIso());
  const [submittedThreshold, setSubmittedThreshold] = useState(0.8);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [webhookRotating, setWebhookRotating] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [tenantSettings, setTenantSettings] = useState<TenantDashboardSettings>({
    planMonthlyEventsLimit: null,
    planMonthlyRecoveryLimit: null,
    billingPlan: null,
    recoveryContactCooldownMinutes: null,
    recoveryContactMaxAttemptsPerDay: null,
    webhookProviderPreferred: null,
  });
  const undoTimeoutRef = useRef<number | null>(null);
  const dashboardTopRef = useRef<HTMLElement | null>(null);
  const attemptsSectionRef = useRef<HTMLDivElement | null>(null);
  const integrationsSectionRef = useRef<HTMLElement | null>(null);
  const messagesSectionRef = useRef<HTMLElement | null>(null);
  const accountSectionRef = useRef<HTMLElement | null>(null);
  const settingsSectionRef = useRef<HTMLElement | null>(null);
  const tenantComboboxRef = useRef<HTMLDivElement | null>(null);
  const [isTenantComboboxOpen, setIsTenantComboboxOpen] = useState(false);
  const [isSettingsWebhookProviderOpen, setIsSettingsWebhookProviderOpen] = useState(false);
  const settingsWebhookProviderRef = useRef<HTMLDivElement | null>(null);
  const [isPageSizeOpen, setIsPageSizeOpen] = useState(false);
  const pageSizeRef = useRef<HTMLDivElement | null>(null);
  const [isSavedViewsSelectOpen, setIsSavedViewsSelectOpen] = useState(false);
  const savedViewsSelectRef = useRef<HTMLDivElement | null>(null);
  const [isSovereignTxFilterOpen, setIsSovereignTxFilterOpen] = useState(false);
  const sovereignTxFilterRef = useRef<HTMLDivElement | null>(null);
  const [sovereignNavOpen, setSovereignNavOpen] = useState(false);
  const [sovereignTxStageFilters, setSovereignTxStageFilters] = useState<string[]>([]);
  const [attemptStatusFilter, setAttemptStatusFilter] = useState<"all" | "success" | "failure" | "pending">("all");
  const [dashboardQuickRange, setDashboardQuickRange] = useState<"7d" | "30d" | "90d" | "month" | "custom">("30d");
  const [isAttemptStatusOpen, setIsAttemptStatusOpen] = useState(false);
  const attemptStatusRef = useRef<HTMLDivElement | null>(null);
  const [enabledProviders, setEnabledProviders] = useState<Record<WebhookProvider, boolean>>({
    hotmart: false,
    kiwify: false,
    hubla: false,
    generic: false,
  });
  const [providerModalOpen, setProviderModalOpen] = useState(false);
  const [providerEditing, setProviderEditing] = useState<ProviderKey | null>(null);
  const [providerConfigDraft, setProviderConfigDraft] = useState<ProviderConfig>(emptyProviderConfig());
  const [providerConfigs, setProviderConfigs] = useState<Record<ProviderKey, ProviderConfig | null>>({
    hotmart: null,
    kiwify: null,
    hubla: null,
    generic: null,
  });
  const [attemptActions, setAttemptActions] = useState<
    Array<{
      id: string;
      createdAt: string;
      provider: string;
      channel: string;
      actionLabel: string;
      amount: number;
      reason: string;
      tone: "negative" | "positive";
    }>
  >([]);
  const [attemptActionsLoading, setAttemptActionsLoading] = useState(false);
  const [isIntegrationsProviderOpen, setIsIntegrationsProviderOpen] = useState(false);
  const integrationsProviderRef = useRef<HTMLDivElement | null>(null);
  const [accountContact, setAccountContact] = useState({
    responsibleName: "",
    email: "",
    phone: "",
    whatsapp: "",
    role: "",
  });
  const [accountCompany, setAccountCompany] = useState({
    companyName: "",
    cnpj: "",
    domain: "",
  });

  const [messageTemplatesList, setMessageTemplatesList] = useState<DashboardMessageTemplate[]>([]);
  const [whatsappFlows, setWhatsappFlows] = useState<DashboardWhatsappFlow[]>([]);
  const [messageVariantsList, setMessageVariantsList] = useState<DashboardMessageVariant[]>([]);
  const [triggerCatalog, setTriggerCatalog] = useState<TriggerCatalogEntry[]>([]);
  const [selectedWhatsappFlowId, setSelectedWhatsappFlowId] = useState<string | null>(null);
  const selectedWhatsappFlowIdRef = useRef<string | null>(null);
  selectedWhatsappFlowIdRef.current = selectedWhatsappFlowId;
  const [messageEditorTemplateId, setMessageEditorTemplateId] = useState<string | null>(null);
  const [messageEditorName, setMessageEditorName] = useState("Mensagem de recuperação");
  const [messageEditorBody, setMessageEditorBody] = useState("");
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messagesSaving, setMessagesSaving] = useState(false);
  const [messagesBootstrapping, setMessagesBootstrapping] = useState(false);
  const [messagesAddingFlow, setMessagesAddingFlow] = useState(false);
  const [recoveryLinksLoading, setRecoveryLinksLoading] = useState(false);
  const [recoveryLinksList, setRecoveryLinksList] = useState<DashboardRecoveryLink[]>([]);
  const [recoveryLinkDrafts, setRecoveryLinkDrafts] = useState<Record<string, RecoveryLinkDraft>>({});
  const [newRecoveryLinkDraft, setNewRecoveryLinkDraft] = useState<RecoveryLinkDraft>(emptyRecoveryLinkDraft());
  const [recoveryLinkSavingId, setRecoveryLinkSavingId] = useState<string | null>(null);
  const [recoveryLinkCreating, setRecoveryLinkCreating] = useState(false);
  const [adminReviewStatusFilter, setAdminReviewStatusFilter] = useState<RecoveryLinkApprovalStatus | "all">(
    "pending_review",
  );
  const [adminReviewTenantFilter, setAdminReviewTenantFilter] = useState("");
  const [adminReviewSearch, setAdminReviewSearch] = useState("");
  const [adminReviewPage, setAdminReviewPage] = useState(1);
  const [adminRecoveryLinksLoading, setAdminRecoveryLinksLoading] = useState(false);
  const [adminRecoveryLinksList, setAdminRecoveryLinksList] = useState<DashboardRecoveryLink[]>([]);
  const [adminRecoveryLinksSummary, setAdminRecoveryLinksSummary] = useState<RecoveryLinksQueueSummary>(
    emptyRecoveryLinksQueueSummary(),
  );
  const [adminRecoveryLinksPagination, setAdminRecoveryLinksPagination] =
    useState<RecoveryLinksQueuePagination>(emptyRecoveryLinksQueuePagination());
  const [recoveryLinkReviewDrafts, setRecoveryLinkReviewDrafts] = useState<Record<string, RecoveryLinkReviewDraft>>({});
  const [recoveryLinkReviewActionId, setRecoveryLinkReviewActionId] = useState<string | null>(null);
  const [newWhatsappTrigger, setNewWhatsappTrigger] = useState("");
  const [variantSavingId, setVariantSavingId] = useState<string | null>(null);
  const [isMessagesTriggerDropdownOpen, setIsMessagesTriggerDropdownOpen] = useState(false);
  const messagesTriggerDropdownRef = useRef<HTMLDivElement | null>(null);
  const [isMessagesSceneDropdownOpen, setIsMessagesSceneDropdownOpen] = useState(false);
  const messagesSceneDropdownRef = useRef<HTMLDivElement | null>(null);
  const messageEditorBodyRef = useRef<HTMLTextAreaElement | null>(null);
  const messageBodyCaretRef = useRef({ start: 0, end: 0 });

  const dashboardAuthGate =
    import.meta.env.VITE_DASHBOARD_AUTH_REQUIRED === "true" || import.meta.env.VITE_DASHBOARD_AUTH_REQUIRED === "1";

  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(!isSupabaseBrowserConfigured);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authFormError, setAuthFormError] = useState<string | null>(null);
  const [authFormInfo, setAuthFormInfo] = useState<string | null>(null);
  const [showAuthPassword, setShowAuthPassword] = useState(false);
  const [forgotBusy, setForgotBusy] = useState(false);
  const [passwordRecoveryActive, setPasswordRecoveryActive] = useState(false);
  const [recoveryNewPassword, setRecoveryNewPassword] = useState("");
  const [recoveryConfirmPassword, setRecoveryConfirmPassword] = useState("");
  const [recoveryBusy, setRecoveryBusy] = useState(false);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const [serverTenants, setServerTenants] = useState<DashboardMeTenant[]>([]);
  const [canReviewRecoveryLinks, setCanReviewRecoveryLinks] = useState(false);
  const [webhookChangeDialogOpen, setWebhookChangeDialogOpen] = useState(false);
  const [webhookChangePassword, setWebhookChangePassword] = useState("");
  const [webhookChangeBusy, setWebhookChangeBusy] = useState(false);
  const [webhookChangeError, setWebhookChangeError] = useState<string | null>(null);

  const baseUrl = import.meta.env.VITE_API_BASE_URL?.trim() || "http://127.0.0.1:3000";

  useEffect(() => {
    setAdminReviewPage(1);
  }, [adminReviewStatusFilter, adminReviewTenantFilter, adminReviewSearch]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.location.hash.replace(/^#/, "");
    if (!raw) return;
    const params = new URLSearchParams(raw);
    if (params.get("type") === "recovery") {
      setPasswordRecoveryActive(true);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("post_checkout") !== "1") return;

    const checkoutEmail = params.get("email")?.trim() ?? "";
    if (checkoutEmail) {
      setAuthEmail(checkoutEmail);
    }

    setAuthFormError(null);
    setAuthFormInfo(
      "Pagamento confirmado. Defina sua senha pelo link enviado ao seu e-mail para concluir o acesso ao painel.",
    );
  }, []);

  useEffect(() => {
    if (!isSupabaseBrowserConfigured || !supabase) {
      setAuthReady(true);
      return;
    }
    let cancelled = false;
    void supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setAccessToken(data.session?.access_token ?? null);
      setAuthReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      setAccessToken(session?.access_token ?? null);
      if (event === "PASSWORD_RECOVERY") {
        setPasswordRecoveryActive(true);
      }
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const onPasswordRecoverySubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!supabase) return;
    setRecoveryError(null);
    const p1 = recoveryNewPassword.trim();
    const p2 = recoveryConfirmPassword.trim();
    if (p1.length < 8) {
      setRecoveryError("Use pelo menos 8 caracteres na nova senha.");
      return;
    }
    if (p1 !== p2) {
      setRecoveryError("As senhas não coincidem.");
      return;
    }
    setRecoveryBusy(true);
    const { error: updErr } = await supabase.auth.updateUser({ password: p1 });
    setRecoveryBusy(false);
    if (updErr) {
      setRecoveryError(updErr.message);
      return;
    }
    setPasswordRecoveryActive(false);
    setRecoveryNewPassword("");
    setRecoveryConfirmPassword("");
    if (typeof window !== "undefined" && window.location.hash) {
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  };

  useEffect(() => {
    if (!passwordRecoveryActive || accessToken || !authReady) return;
    const id = window.setTimeout(() => {
      setPasswordRecoveryActive(false);
      setAuthFormError(
        "Não foi possível validar o link de recuperação (expirado ou inválido). Peça um novo e-mail ou redefina a senha com o administrador.",
      );
      if (typeof window !== "undefined" && window.location.hash) {
        window.history.replaceState(null, "", window.location.pathname + window.location.search);
      }
    }, 10_000);
    return () => window.clearTimeout(id);
  }, [passwordRecoveryActive, accessToken, authReady]);

  useEffect(() => {
    if (!accessToken?.trim()) {
      setServerTenants([]);
      setCanReviewRecoveryLinks(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const response = await dashboardFetch(`${baseUrl}/dashboard/me`, accessToken);
        const body = (await readResponseJson(response)) as {
          ok?: boolean;
          authMode?: string;
          tenants?: DashboardMeTenant[];
          operationalAccess?: {
            canReviewRecoveryLinks?: boolean;
          };
        } | null;
        if (cancelled || !response.ok || !body?.ok || !Array.isArray(body.tenants)) return;
        setServerTenants(body.tenants);
        setCanReviewRecoveryLinks(Boolean(body.operationalAccess?.canReviewRecoveryLinks));
        if (body.authMode === "bearer" && body.tenants.length === 1) {
          const id = body.tenants[0].id;
          setSubmittedTenantId(id);
          setTenantId(id);
        }
      } catch {
        if (!cancelled) {
          setServerTenants([]);
          setCanReviewRecoveryLinks(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accessToken, baseUrl]);

  const overviewEnabled =
    submittedTenantId.trim().length > 0 && (!dashboardAuthGate || Boolean(accessToken?.trim()));

  const { data, isLoading, isFetching, error, refetch } = useDashboardOverview({
    baseUrl,
    tenantId: submittedTenantId,
    from: submittedFrom,
    to: submittedTo,
    warningThreshold: submittedThreshold,
    enabled: overviewEnabled,
    accessToken,
  });

  const selectedRangeLabel = useMemo(() => {
    if (!data) return "";
    return `${formatDate(data.range.from)} ate ${formatDate(data.range.to)} (${data.range.days} dias)`;
  }, [data]);

  const accountUsageCombinedPct = useMemo(() => {
    const u = data?.usage?.usage;
    if (!u) return null;
    const e = u.events.utilizationRate;
    const r = u.recoveryAttempts.utilizationRate;
    if (e == null && r == null) return null;
    if (e != null && r != null) return ((e + r) / 2) * 100;
    return ((e ?? r) ?? 0) * 100;
  }, [data]);

  const tenantOptions = useMemo(() => {
    const fromServer = serverTenants.map((t) => t.id.trim()).filter((id) => isUuidV4Like(id));
    const known = [
      ...fromServer,
      import.meta.env.VITE_TENANT_ID,
      submittedTenantId,
      ...savedViews.map((view) => view.tenantId),
    ]
      .map((value) => value?.trim())
      .filter((value): value is string => Boolean(value && isUuidV4Like(value)));
    return Array.from(new Set(known));
  }, [submittedTenantId, savedViews, serverTenants]);
  const serverTenantIds = useMemo(
    () => new Set(serverTenants.map((tenant) => tenant.id.trim().toLowerCase())),
    [serverTenants],
  );
  const hasTenantOptions = tenantOptions.length > 0;
  const selectedTenantOption = tenantOptions.includes(tenantId) ? tenantId : "";

  useEffect(() => {
    if (!accessToken?.trim() || serverTenants.length === 0) return;
    const normalizedSubmitted = submittedTenantId.trim().toLowerCase();
    const allowed = normalizedSubmitted && serverTenantIds.has(normalizedSubmitted);
    if (allowed) return;
    const fallback = serverTenants[0]?.id?.trim();
    if (!fallback) return;
    setTenantId(fallback);
    setSubmittedTenantId(fallback);
  }, [accessToken, serverTenants, serverTenantIds, submittedTenantId]);

  const orderedViews = useMemo(() => {
    const current = [...savedViews];
    current.sort((a, b) => {
      if (a.isFavorite !== b.isFavorite) return a.isFavorite ? -1 : 1;
      return a.position - b.position;
    });
    return current;
  }, [savedViews]);

  const filteredViews = useMemo(() => {
    const query = viewsSearch.trim().toLowerCase();
    if (!query) return orderedViews;
    return orderedViews.filter((view) => {
      return (
        view.name.toLowerCase().includes(query) ||
        view.tenantId.toLowerCase().includes(query) ||
        view.from.toLowerCase().includes(query) ||
        view.to.toLowerCase().includes(query)
      );
    });
  }, [orderedViews, viewsSearch]);

  const pendingDeleteView = useMemo(
    () => savedViews.find((view) => view.id === pendingDeleteViewId) ?? null,
    [savedViews, pendingDeleteViewId],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(SAVED_VIEWS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Array<
          Omit<SavedView, "isFavorite" | "position"> & { isFavorite?: boolean; position?: number }
        >;
        if (Array.isArray(parsed)) {
          setSavedViews(
            parsed.map((view, index) => ({
              ...view,
              isFavorite: view.isFavorite ?? false,
              position: typeof view.position === "number" ? view.position : index + 1,
            })),
          );
        }
      }
      const defaultRaw = window.localStorage.getItem(DEFAULT_VIEW_KEY);
      if (defaultRaw) setDefaultViewId(defaultRaw);
    } catch {
      // Ignora erros de leitura/localStorage indisponível.
    } finally {
      setViewsHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(SAVED_VIEWS_KEY, JSON.stringify(savedViews));
  }, [savedViews]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!defaultViewId) {
      window.localStorage.removeItem(DEFAULT_VIEW_KEY);
      return;
    }
    window.localStorage.setItem(DEFAULT_VIEW_KEY, defaultViewId);
  }, [defaultViewId]);

  useEffect(() => {
    return () => {
      if (undoTimeoutRef.current !== null) {
        window.clearTimeout(undoTimeoutRef.current);
      }
    };
  }, []);

  const filteredAndSortedPoints = useMemo(() => {
    const points = [...(data?.timeseries.points ?? [])];
    const query = search.trim().toLowerCase();
    const filtered = !query
      ? points
      : points.filter((point) => {
          const day = formatDate(point.day).toLowerCase();
          return (
            day.includes(query) ||
            String(point.events).includes(query) ||
            String(point.recoveryAttempts).includes(query)
          );
        });
    filtered.sort((a, b) => {
      let comparison = 0;
      if (sortKey === "day") comparison = a.day.localeCompare(b.day);
      if (sortKey === "events") comparison = a.events - b.events;
      if (sortKey === "recoveryAttempts") comparison = a.recoveryAttempts - b.recoveryAttempts;
      return sortDirection === "asc" ? comparison : comparison * -1;
    });
    return filtered;
  }, [data?.timeseries.points, search, sortDirection, sortKey]);

  useEffect(() => {
    setPage(1);
  }, [search, sortDirection, sortKey, data?.timeseries.points, pageSize]);

  useEffect(() => {
    setAttemptLogPage(1);
  }, [attemptLogSearch, attemptStatusFilter, attemptLogRange, attemptActions.length, pageSize]);

  const totalPages = Math.max(Math.ceil(filteredAndSortedPoints.length / pageSize), 1);
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const pagedPoints = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filteredAndSortedPoints.slice(start, start + pageSize);
  }, [filteredAndSortedPoints, pageSize, safePage]);

  const attemptDateCutoffMs = useMemo(() => {
    if (attemptLogRange === "all") return null;
    const days = Number(attemptLogRange);
    return Date.now() - days * 86400000;
  }, [attemptLogRange]);

  const filteredAttemptActions = useMemo(() => {
    const query = attemptLogSearch.trim().toLowerCase();
    const base = [...attemptActions]
      .filter((row) => {
        if (attemptDateCutoffMs === null) return true;
        return new Date(row.createdAt).getTime() >= attemptDateCutoffMs;
      })
      .filter((row) => {
        if (attemptStatusFilter === "all") return true;
        if (attemptStatusFilter === "failure") return row.tone === "negative";
        if (attemptStatusFilter === "pending") return row.actionLabel === "Agendada";
        return row.tone === "positive" && row.actionLabel !== "Agendada";
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    if (!query) return base;
    return base.filter((row) =>
      [row.id, row.provider, row.channel, row.actionLabel, row.reason, formatDateTime(row.createdAt)]
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [attemptActions, attemptDateCutoffMs, attemptLogSearch, attemptStatusFilter]);

  const attemptLogStats = useMemo(() => {
    const rows = filteredAttemptActions;
    const total = rows.length;
    const pending = rows.filter((r) => r.actionLabel === "Agendada").length;
    const failed = rows.filter((r) => r.tone === "negative").length;
    const success = rows.filter((r) => r.tone === "positive" && r.actionLabel !== "Agendada").length;
    const settled = success + failed;
    const successRate = settled > 0 ? (success / settled) * 100 : null;
    const todayKey = new Date().toDateString();
    const failuresToday = rows.filter((r) => r.tone === "negative" && new Date(r.createdAt).toDateString() === todayKey).length;
    return { successRate, failuresToday, total, pending, settled };
  }, [filteredAttemptActions]);

  const attemptTotalPages = Math.max(Math.ceil(filteredAttemptActions.length / pageSize), 1);
  const attemptSafePage = Math.min(Math.max(attemptLogPage, 1), attemptTotalPages);

  useEffect(() => {
    setAttemptLogPage((prev) => {
      const next = Math.min(Math.max(prev, 1), attemptTotalPages);
      return next === prev ? prev : next;
    });
  }, [attemptTotalPages]);

  const attemptLogPageList = useMemo(
    () => buildAttemptLogPageList(attemptSafePage, attemptTotalPages),
    [attemptSafePage, attemptTotalPages],
  );

  const pagedAttemptActions = useMemo(() => {
    const start = (attemptSafePage - 1) * pageSize;
    return filteredAttemptActions.slice(start, start + pageSize);
  }, [attemptSafePage, filteredAttemptActions, pageSize]);

  type SovereignTxRow = {
    day: string;
    toFrom: string;
    account: string;
    method: string;
    methodChipClass: "is-success" | "is-failure" | "is-pending";
    amountText: string;
    amountTone: "negative" | "positive";
    amountValue: number;
  };

  const [sovereignTxRows, setSovereignTxRows] = useState<SovereignTxRow[]>([]);
  const [sovereignRecoveredAmount, setSovereignRecoveredAmount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const loadSovereignRows = async () => {
      if (!attemptsTenantId.trim()) {
        setSovereignTxRows([]);
        return;
      }
      try {
        const query = new URLSearchParams({
          tenantId: attemptsTenantId,
          from: submittedFrom,
          to: submittedTo,
          limit: "5",
        });
        const attemptsResponse = await dashboardFetch(`${baseUrl}/recovery-attempts?${query.toString()}`, accessToken);
        const attemptsPayload = (await readResponseJson(attemptsResponse)) as
          | {
              ok?: boolean;
              items?: Array<{
                createdAt: string;
                eventId: string;
                channel: string;
                status: "scheduled" | "simulated_sent" | "sent" | "failed";
              }>;
            }
          | null
          | undefined;
        if (!attemptsResponse.ok || !attemptsPayload?.ok || !Array.isArray(attemptsPayload.items)) {
          throw new Error(formatHttpError("Falha ao carregar tentativas recentes", attemptsResponse, attemptsPayload));
        }

        const providerMap = new Map<string, string>();
        await Promise.all(
          attemptsPayload.items.map(async (item) => {
            try {
              const eventResponse = await dashboardFetch(
                `${baseUrl}/recovery-attempts/event/${item.eventId}?tenantId=${encodeURIComponent(attemptsTenantId)}`,
                accessToken,
              );
              const eventPayload = (await readResponseJson(eventResponse)) as {
                ok?: boolean;
                event?: { provider?: string };
              } | null;
              if (eventResponse.ok && eventPayload?.ok && eventPayload.event?.provider) {
                providerMap.set(item.eventId, eventPayload.event.provider);
              }
            } catch {
              // Mantém fallback de provedor quando falhar consulta de detalhe.
            }
          }),
        );

        const statusLabel: Record<"scheduled" | "simulated_sent" | "sent" | "failed", string> = {
          scheduled: "Agendada",
          simulated_sent: "Recuperação enviada",
          sent: "Recuperação enviada",
          failed: "Falha no pagamento",
        };

        const rows: SovereignTxRow[] = attemptsPayload.items.map((item) => {
          const isNegative = item.status === "failed";
          const methodChipClass =
            item.status === "failed" ? "is-failure" : item.status === "scheduled" ? "is-pending" : "is-success";
          const providerRaw = providerMap.get(item.eventId) ?? "N/D";
          const provider = providerRaw.charAt(0).toUpperCase() + providerRaw.slice(1).toLowerCase();
          const meta = (item as { meta?: Record<string, unknown> | null }).meta;
          const amountRaw = meta && typeof meta === "object" ? meta.amount : null;
          const amount = typeof amountRaw === "number" ? amountRaw : Number(amountRaw ?? 0);
          return {
            day: item.createdAt,
            toFrom: provider,
            account: item.channel || "Canal",
            method: statusLabel[item.status],
            methodChipClass,
            amountText: `${isNegative ? "-" : "+"}${formatCurrencyBrl(Number.isFinite(amount) && amount > 0 ? amount : 0)}`,
            amountTone: isNegative ? "negative" : "positive",
            amountValue: (isNegative ? -1 : 1) * (Number.isFinite(amount) && amount > 0 ? amount : 0),
          };
        });
        if (!cancelled) setSovereignTxRows(rows);
      } catch (error) {
        if (!cancelled) {
          setSovereignTxRows([]);
          pushToast(error instanceof Error ? error.message : "Falha ao carregar tentativas recentes.");
        }
      }
    };
    void loadSovereignRows();
    return () => {
      cancelled = true;
    };
  }, [accessToken, attemptsTenantId, baseUrl, submittedFrom, submittedTo]);

  useEffect(() => {
    let cancelled = false;
    const loadAttemptActions = async () => {
      if (!attemptsTenantId.trim()) {
        setAttemptActions([]);
        return;
      }
      setAttemptActionsLoading(true);
      try {
        const query = new URLSearchParams({
          tenantId: attemptsTenantId,
          from: submittedFrom,
          to: submittedTo,
          limit: "100",
        });
        const response = await dashboardFetch(`${baseUrl}/recovery-attempts?${query.toString()}`, accessToken);
        const payload = (await readResponseJson(response)) as
          | {
              ok?: boolean;
              items?: Array<{
                id: string;
                createdAt: string;
                channel: string;
                status: "scheduled" | "simulated_sent" | "sent" | "failed";
                reason: string | null;
                meta?: Record<string, unknown> | null;
              }>;
            }
          | null
          | undefined;
        if (!response.ok || !payload?.ok || !Array.isArray(payload.items)) {
          throw new Error(formatHttpError("Falha ao carregar ações", response, payload));
        }
        const statusLabel: Record<"scheduled" | "simulated_sent" | "sent" | "failed", string> = {
          scheduled: "Agendada",
          simulated_sent: "Recuperação enviada",
          sent: "Recuperação enviada",
          failed: "Falha no pagamento",
        };
        const rows = payload.items.map((item) => {
          const meta = item.meta && typeof item.meta === "object" ? item.meta : {};
          const providerRaw = typeof meta.provider === "string" && meta.provider.trim() ? meta.provider : "N/D";
          const amountRaw = typeof meta.amount === "number" ? meta.amount : Number(meta.amount ?? 0);
          const amount = Number.isFinite(amountRaw) ? amountRaw : 0;
          const isNegative = item.status === "failed";
          const tone: "negative" | "positive" = isNegative ? "negative" : "positive";
          return {
            id: item.id,
            createdAt: item.createdAt,
            provider: providerRaw,
            channel: item.channel || "canal",
            actionLabel: statusLabel[item.status],
            amount,
            reason: item.reason ?? (typeof meta.reason === "string" ? meta.reason : "-"),
            tone,
          };
        });
        if (!cancelled) setAttemptActions(rows);
      } catch (error) {
        if (!cancelled) {
          setAttemptActions([]);
          pushToast(error instanceof Error ? error.message : "Falha ao carregar ações.");
        }
      } finally {
        if (!cancelled) setAttemptActionsLoading(false);
      }
    };
    void loadAttemptActions();
    return () => {
      cancelled = true;
    };
  }, [accessToken, attemptsTenantId, baseUrl, submittedFrom, submittedTo]);

  useEffect(() => {
    let cancelled = false;
    const loadRecoveredAmount = async () => {
      if (!attemptsTenantId.trim()) {
        setSovereignRecoveredAmount(0);
        return;
      }
      try {
        let cursor = "";
        let hasMore = true;
        let total = 0;
        while (hasMore) {
          const query = new URLSearchParams({
            tenantId: attemptsTenantId,
            from: submittedFrom,
            to: submittedTo,
            limit: "100",
          });
          if (cursor) query.set("cursor", cursor);
          const response = await dashboardFetch(`${baseUrl}/recovery-attempts?${query.toString()}`, accessToken);
          const payload = (await readResponseJson(response)) as
            | {
                ok?: boolean;
                page?: { hasMore?: boolean; nextCursor?: string | null };
                items?: Array<{
                  status: "scheduled" | "simulated_sent" | "sent" | "failed";
                  meta?: Record<string, unknown> | null;
                }>;
              }
            | null
            | undefined;
          if (!response.ok || !payload?.ok || !Array.isArray(payload.items)) break;
          for (const item of payload.items) {
            if (item.status !== "sent" && item.status !== "simulated_sent") continue;
            const amountRaw = item.meta && typeof item.meta === "object" ? item.meta.amount : null;
            const amount = typeof amountRaw === "number" ? amountRaw : Number(amountRaw ?? 0);
            if (Number.isFinite(amount) && amount > 0) total += amount;
          }
          hasMore = Boolean(payload.page?.hasMore);
          cursor = payload.page?.nextCursor ?? "";
          if (!cursor) hasMore = false;
        }
        if (!cancelled) setSovereignRecoveredAmount(total);
      } catch {
        if (!cancelled) setSovereignRecoveredAmount(0);
      }
    };
    void loadRecoveredAmount();
    return () => {
      cancelled = true;
    };
  }, [accessToken, attemptsTenantId, baseUrl, submittedFrom, submittedTo]);

  const onSort = (nextKey: TimeseriesSortKey) => {
    if (sortKey === nextKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(nextKey);
    setSortDirection(nextKey === "day" ? "asc" : "desc");
  };

  const applyDashboardQuickRange = (preset: "7d" | "30d" | "90d" | "month") => {
    const range =
      preset === "7d"
        ? last7DaysIso()
        : preset === "30d"
          ? last30DaysIso()
          : preset === "90d"
            ? last90DaysIso()
            : { from: startOfMonthIso(), to: endOfDayIso() };
    setFrom(range.from);
    setTo(range.to);
    setSubmittedFrom(range.from);
    setSubmittedTo(range.to);
    setDashboardQuickRange(preset);
  };

  const pushToast = (
    text: string,
    options?: { actionLabel?: string; onAction?: () => void; durationMs?: number },
  ) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setToasts((current) => [
      ...current,
      { id, text, actionLabel: options?.actionLabel, onAction: options?.onAction },
    ]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, options?.durationMs ?? 2200);
  };

  const insertRecoveryPlaceholder = (text: string) => {
    if (settingsMutationsDisabled) return;
    const { start, end } = messageBodyCaretRef.current;
    setMessageEditorBody((prev) => {
      const a = Math.min(Math.max(0, start), prev.length);
      const b = Math.min(Math.max(a, end), prev.length);
      const next = `${prev.slice(0, a)}${text}${prev.slice(b)}`;
      const caret = a + text.length;
      messageBodyCaretRef.current = { start: caret, end: caret };
      queueMicrotask(() => {
        const el = messageEditorBodyRef.current;
        if (!el) return;
        el.focus();
        el.setSelectionRange(caret, caret);
      });
      return next;
    });
  };

  const navigateToMenu = (menu: SideMenuKey) => {
    setSovereignNavOpen(false);
    const navigationTenantId = menu === "attempts" ? attemptsTenantId : submittedTenantId;
    setActiveMenu(menu);
    if (menu === "attempts" && targetTenantId && targetTenantId !== submittedTenantId) {
      setSubmittedTenantId(targetTenantId);
    }
    if (menu !== "dashboard" && !navigationTenantId.trim()) {
      pushToast("Selecione uma conta para navegar nas seções.");
      return;
    }

    const target =
      menu === "dashboard"
        ? dashboardTopRef.current
        : menu === "account"
          ? accountSectionRef.current
        : menu === "settings"
          ? settingsSectionRef.current
        : menu === "attempts"
          ? attemptsSectionRef.current
          : menu === "messages"
            ? messagesSectionRef.current
          : integrationsSectionRef.current;

    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  useEffect(() => {
    if (!sovereignNavOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSovereignNavOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [sovereignNavOpen]);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1025px)");
    const onChange = () => setSovereignNavOpen(false);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const applyView = (selected: SavedView) => {
    setTenantId(selected.tenantId);
    setSubmittedTenantId(selected.tenantId);
    setFrom(selected.from);
    setSubmittedFrom(selected.from);
    setTo(selected.to);
    setSubmittedTo(selected.to);
    setWarningThreshold(selected.warningThreshold);
    setSubmittedThreshold(selected.warningThreshold);
    setSearch(selected.search);
    setSortKey(selected.sortKey);
    setSortDirection(selected.sortDirection);
  };

  useEffect(() => {
    if (!viewsHydrated || !defaultViewId || autoAppliedDefault) return;
    const selected = savedViews.find((item) => item.id === defaultViewId);
    if (!selected) return;
    setSelectedViewId(selected.id);
    applyView(selected);
    setAutoAppliedDefault(true);
  }, [viewsHydrated, defaultViewId, savedViews, autoAppliedDefault]);

  useEffect(() => {
    if (!isTenantComboboxOpen) return;
    const handleOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (tenantComboboxRef.current?.contains(target)) return;
      setIsTenantComboboxOpen(false);
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsTenantComboboxOpen(false);
    };
    window.addEventListener("mousedown", handleOutsideClick);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("mousedown", handleOutsideClick);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [isTenantComboboxOpen]);

  useEffect(() => {
    if (
      !isSettingsWebhookProviderOpen &&
      !isPageSizeOpen &&
      !isSavedViewsSelectOpen &&
      !isSovereignTxFilterOpen &&
      !isAttemptStatusOpen &&
      !isAttemptRangeOpen &&
      !isIntegrationsProviderOpen &&
      !isMessagesTriggerDropdownOpen &&
      !isMessagesSceneDropdownOpen
    ) {
      return;
    }
    const handleOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (settingsWebhookProviderRef.current?.contains(target)) return;
      if (pageSizeRef.current?.contains(target)) return;
      if (savedViewsSelectRef.current?.contains(target)) return;
      if (sovereignTxFilterRef.current?.contains(target)) return;
      if (attemptStatusRef.current?.contains(target)) return;
      if (attemptRangeRef.current?.contains(target)) return;
      if (integrationsProviderRef.current?.contains(target)) return;
      if (messagesTriggerDropdownRef.current?.contains(target)) return;
      if (messagesSceneDropdownRef.current?.contains(target)) return;
      setIsSettingsWebhookProviderOpen(false);
      setIsPageSizeOpen(false);
      setIsSavedViewsSelectOpen(false);
      setIsSovereignTxFilterOpen(false);
      setIsAttemptStatusOpen(false);
      setIsAttemptRangeOpen(false);
      setIsIntegrationsProviderOpen(false);
      setIsMessagesTriggerDropdownOpen(false);
      setIsMessagesSceneDropdownOpen(false);
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setIsSettingsWebhookProviderOpen(false);
      setIsPageSizeOpen(false);
      setIsSavedViewsSelectOpen(false);
      setIsSovereignTxFilterOpen(false);
      setIsAttemptStatusOpen(false);
      setIsAttemptRangeOpen(false);
      setIsIntegrationsProviderOpen(false);
      setIsMessagesTriggerDropdownOpen(false);
      setIsMessagesSceneDropdownOpen(false);
    };
    window.addEventListener("mousedown", handleOutsideClick);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("mousedown", handleOutsideClick);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [
    isSettingsWebhookProviderOpen,
    isPageSizeOpen,
    isSavedViewsSelectOpen,
    isSovereignTxFilterOpen,
    isAttemptStatusOpen,
    isAttemptRangeOpen,
    isIntegrationsProviderOpen,
    isMessagesTriggerDropdownOpen,
    isMessagesSceneDropdownOpen,
  ]);

  const pageSizeOptions = [
    { value: "5", label: "5 itens" },
    { value: "10", label: "10 itens" },
    { value: "20", label: "20 itens" },
  ] as const;

  const webhookProviderOptions: DropdownOption<WebhookProvider>[] = [
    { value: "", label: "Automático" },
    { value: "hotmart", label: "Hotmart" },
    { value: "kiwify", label: "Kiwify" },
    { value: "hubla", label: "Hubla" },
    { value: "generic", label: "Outra ou personalizada" },
  ];

  const providerItems: Array<{
    key: ProviderKey;
    label: string;
    subtitle: string;
    logoText: string;
    logoClass: string;
  }> = [
    { key: "hotmart", label: "Hotmart", subtitle: "Checkout e notificações", logoText: "H", logoClass: "provider-hotmart" },
    { key: "kiwify", label: "Kiwify", subtitle: "Checkout e assinaturas", logoText: "K", logoClass: "provider-kiwify" },
    { key: "hubla", label: "Hubla", subtitle: "Checkout e notificações", logoText: "Hu", logoClass: "provider-hubla" },
    { key: "generic", label: "Outra ou personalizada", subtitle: "Integração sob medida", logoText: "{}", logoClass: "provider-generic" },
  ];

  const openProviderConfig = (providerKey: ProviderKey) => {
    const existing = providerConfigs[providerKey];
    setProviderEditing(providerKey);
    setProviderConfigDraft(
      existing ?? {
        ...emptyProviderConfig(webhookUrl || ""),
        enabled: enabledProviders[providerKey],
      },
    );
    setProviderModalOpen(true);
  };

  const isProviderConnected = (providerKey: ProviderKey) =>
    enabledProviders[providerKey] && providerConfigHasRequiredFields(providerKey, providerConfigs[providerKey]);

  const onSaveView = () => {
    const name = viewName.trim();
    if (!name) return;
    const view: SavedView = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      isFavorite: false,
      position: Math.max(0, ...savedViews.map((item) => item.position)) + 1,
      tenantId: tenantId.trim(),
      from: from.trim(),
      to: to.trim(),
      warningThreshold,
      search: search.trim(),
      sortKey,
      sortDirection,
      theme,
    };
    setSavedViews((current) => [view, ...current].slice(0, 20));
    setSelectedViewId(view.id);
    if (!defaultViewId) setDefaultViewId(view.id);
    setViewName("");
    pushToast("Filtro salvo com sucesso.");
  };

  const onApplyView = () => {
    const selected = savedViews.find((item) => item.id === selectedViewId);
    if (!selected) return;
    applyView(selected);
  };

  const requestDeleteView = (viewId: string) => {
    if (!viewId) return;
    setPendingDeleteViewId(viewId);
  };

  const deleteViewById = (viewId: string) => {
    if (!viewId) return;
    const removedId = viewId;
    const removedView = savedViews.find((item) => item.id === removedId);
    if (!removedView) return;
    const wasDefault = defaultViewId === removedId;

    if (undoTimeoutRef.current !== null) {
      window.clearTimeout(undoTimeoutRef.current);
      undoTimeoutRef.current = null;
    }

    setSavedViews((current) => current.filter((item) => item.id !== removedId));
    if (wasDefault) setDefaultViewId("");
    if (selectedViewId === removedId) {
      setSelectedViewId("");
    }

    const deletionId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const snapshot: DeletedViewSnapshot = {
      deletionId,
      view: removedView,
      wasDefault,
    };
    setLastDeletedView(snapshot);

    undoTimeoutRef.current = window.setTimeout(() => {
      setLastDeletedView((current) => (current?.deletionId === deletionId ? null : current));
    }, 8000);

    pushToast("Filtro excluido.", {
      actionLabel: "Desfazer",
      onAction: () => {
        setLastDeletedView((current) => {
          if (!current || current.deletionId !== deletionId) return current;
          setSavedViews((views) => {
            if (views.some((item) => item.id === current.view.id)) return views;
            const withRestored = [...views];
            const insertAt = Math.max(0, Math.min(current.view.position - 1, withRestored.length));
            withRestored.splice(insertAt, 0, current.view);
            return withRestored.map((item, index) => ({ ...item, position: index + 1 }));
          });
          if (current.wasDefault) setDefaultViewId(current.view.id);
          setSelectedViewId(current.view.id);
          if (undoTimeoutRef.current !== null) {
            window.clearTimeout(undoTimeoutRef.current);
            undoTimeoutRef.current = null;
          }
          pushToast("Exclusao desfeita.");
          return null;
        });
      },
      durationMs: 8000,
    });
  };

  const onDeleteView = () => {
    if (!selectedViewId) return;
    requestDeleteView(selectedViewId);
  };

  const duplicateViewById = (viewId: string) => {
    const selected = savedViews.find((item) => item.id === viewId);
    if (!selected) return;
    const duplicate: SavedView = {
      ...selected,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: `${selected.name} (copia)`,
      isFavorite: false,
      position: Math.max(0, ...savedViews.map((item) => item.position)) + 1,
    };
    setSavedViews((current) => [duplicate, ...current].slice(0, 20));
    setSelectedViewId(duplicate.id);
    pushToast("Filtro duplicado.");
  };

  const onDuplicateView = () => {
    if (!selectedViewId) return;
    duplicateViewById(selectedViewId);
  };

  const toggleFavoriteById = (viewId: string) => {
    if (!viewId) return;
    const selected = savedViews.find((item) => item.id === viewId);
    setSavedViews((current) =>
      current.map((item) => (item.id === viewId ? { ...item, isFavorite: !item.isFavorite } : item)),
    );
    if (selected) pushToast(selected.isFavorite ? "Filtro desfavoritado." : "Filtro favoritado.");
  };

  const onToggleFavoriteView = () => {
    if (!selectedViewId) return;
    toggleFavoriteById(selectedViewId);
  };

  const setDefaultViewById = (viewId: string) => {
    if (!viewId) return;
    setDefaultViewId(viewId);
    pushToast("Filtro padrão atualizado.");
  };

  const onSetDefaultView = () => {
    if (!selectedViewId) return;
    setDefaultViewById(selectedViewId);
  };

  const onInlineRenameView = (id: string, nextName: string) => {
    const cleanName = nextName.trim();
    if (!cleanName) return;
    setSavedViews((current) => current.map((item) => (item.id === id ? { ...item, name: cleanName } : item)));
    pushToast("Nome do filtro atualizado.");
  };

  const onMoveView = (sourceId: string, targetId: string) => {
    if (!sourceId || !targetId || sourceId === targetId) return;
    const base = [...savedViews];
    const sourceIndex = base.findIndex((item) => item.id === sourceId);
    const targetIndex = base.findIndex((item) => item.id === targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;
    const [moved] = base.splice(sourceIndex, 1);
    base.splice(targetIndex, 0, moved);
    setSavedViews(base.map((item, index) => ({ ...item, position: index + 1 })));
  };

  const onConfirmDeleteView = () => {
    if (!pendingDeleteViewId) return;
    deleteViewById(pendingDeleteViewId);
    setPendingDeleteViewId("");
  };

  const onExportCsv = () => {
    if (!filteredAndSortedPoints.length) return;
    const rows = [
      ["day", "events", "recovery_attempts"],
      ...filteredAndSortedPoints.map((point) => [point.day, String(point.events), String(point.recoveryAttempts)]),
    ];
    const csv = rows
      .map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `relatorio-painel-${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    pushToast("Relatório CSV baixado.");
  };

  const runProviderConnectionTest = (provider: ProviderKey) => {
    const config = providerConfigs[provider];
    if (!enabledProviders[provider]) {
      pushToast("Ative o provedor antes de testar.");
      return;
    }
    if (!providerConfigHasRequiredFields(provider, config)) {
      pushToast(providerFieldCopy(provider).missingFieldsMessage);
      openProviderConfig(provider);
      return;
    }
    pushToast(`Conexão validada localmente para ${providerItems.find((p) => p.key === provider)?.label ?? provider}.`);
  };

  const runQuickAction = (label: string) => {
    if (label.includes("WhatsApp")) {
      navigateToMenu("integrations");
      return;
    }
    if (label.includes("Reprocessar")) {
      navigateToMenu("attempts");
      return;
    }
    if (label.includes("pagamento")) {
      navigateToMenu("integrations");
      return;
    }
    navigateToMenu("settings");
  };

  const targetTenantId = useMemo(() => {
    const normalized = normalizeTenantInput(tenantId);
    if (isUuidV4Like(normalized)) return normalized;
    const submitted = normalizeTenantInput(submittedTenantId);
    return isUuidV4Like(submitted) ? submitted : "";
  }, [tenantId, submittedTenantId]);

  const currentTenantMembershipRole = useMemo(() => {
    if (!targetTenantId) return null;
    return serverTenants.find((t) => t.id === targetTenantId)?.role ?? null;
  }, [serverTenants, targetTenantId]);

  const settingsMutationsDisabled =
    currentTenantMembershipRole === "readonly" || currentTenantMembershipRole === "member";

  const loadTenantDashboardSettings = useCallback(async () => {
    if (!targetTenantId) {
      pushToast("Selecione uma conta válida para carregar as configurações.");
      return;
    }
    if (dashboardAuthGate && !accessToken?.trim()) {
      pushToast("Faça login no painel para carregar as configurações.");
      return;
    }
    setSettingsLoading(true);
    try {
      const response = await dashboardFetch(`${baseUrl}/admin/tenants/${targetTenantId}/settings`, accessToken);
      const payload = (await readResponseJson(response)) as
        | {
            ok?: boolean;
            settings?: {
              limits?: {
                planMonthlyEventsLimit?: number | null;
                planMonthlyRecoveryLimit?: number | null;
                billingPlan?: string | null;
              };
              recoveryPolicy?: {
                contactCooldownMinutes?: number | null;
                contactMaxAttemptsPerDay?: number | null;
              };
              integrations?: {
                webhookProviderPreferred?: WebhookProvider | null;
                currentWebhookUrl?: string | null;
                providerConfigs?: Partial<Record<ProviderKey, Partial<ProviderConfig> | null>>;
              };
            };
            error?: string;
          }
        | null
        | undefined;
      if (!response.ok || !payload?.ok || !payload.settings) {
        throw new Error(payload?.error || `HTTP ${response.status}`);
      }
      setTenantSettings({
        planMonthlyEventsLimit: payload.settings.limits?.planMonthlyEventsLimit ?? null,
        planMonthlyRecoveryLimit: payload.settings.limits?.planMonthlyRecoveryLimit ?? null,
        billingPlan: payload.settings.limits?.billingPlan ?? null,
        recoveryContactCooldownMinutes: payload.settings.recoveryPolicy?.contactCooldownMinutes ?? null,
        recoveryContactMaxAttemptsPerDay: payload.settings.recoveryPolicy?.contactMaxAttemptsPerDay ?? null,
        webhookProviderPreferred: payload.settings.integrations?.webhookProviderPreferred ?? null,
      });
      const configs = payload.settings.integrations?.providerConfigs ?? {};
      const persistedWebhookUrl =
        payload.settings.integrations?.currentWebhookUrl ??
        configs.hotmart?.endpointUrl ??
        configs.kiwify?.endpointUrl ??
        configs.hubla?.endpointUrl ??
        configs.generic?.endpointUrl ??
        "";
      setWebhookUrl(persistedWebhookUrl);
      const nextConfigs: Record<ProviderKey, ProviderConfig | null> = {
        hotmart: configs.hotmart
          ? {
              enabled: Boolean(configs.hotmart.enabled),
              apiKey: configs.hotmart.apiKey ?? "",
              webhookToken: configs.hotmart.webhookToken ?? "",
              endpointUrl: configs.hotmart.endpointUrl ?? persistedWebhookUrl,
            }
          : null,
        kiwify: configs.kiwify
          ? {
              enabled: Boolean(configs.kiwify.enabled),
              apiKey: configs.kiwify.apiKey ?? "",
              webhookToken: configs.kiwify.webhookToken ?? "",
              endpointUrl: configs.kiwify.endpointUrl ?? persistedWebhookUrl,
            }
          : null,
        hubla: configs.hubla
          ? {
              enabled: Boolean(configs.hubla.enabled),
              apiKey: configs.hubla.apiKey ?? "",
              webhookToken: configs.hubla.webhookToken ?? "",
              endpointUrl: configs.hubla.endpointUrl ?? persistedWebhookUrl,
            }
          : null,
        generic: configs.generic
          ? {
              enabled: Boolean(configs.generic.enabled),
              apiKey: configs.generic.apiKey ?? "",
              webhookToken: configs.generic.webhookToken ?? "",
              endpointUrl: configs.generic.endpointUrl ?? persistedWebhookUrl,
            }
          : null,
      };
      setProviderConfigs(nextConfigs);
      setEnabledProviders({
        hotmart: nextConfigs.hotmart?.enabled ?? false,
        kiwify: nextConfigs.kiwify?.enabled ?? false,
        hubla: nextConfigs.hubla?.enabled ?? false,
        generic: nextConfigs.generic?.enabled ?? false,
      });
      pushToast("Configurações carregadas.");
    } catch (error) {
      pushToast(`Falha ao carregar configurações: ${error instanceof Error ? error.message : "erro desconhecido"}`);
    } finally {
      setSettingsLoading(false);
    }
  }, [accessToken, baseUrl, dashboardAuthGate, targetTenantId]);

  const saveTenantDashboardSettings = async (options?: {
    providerConfigsOverride?: Record<ProviderKey, ProviderConfig | null>;
    enabledProvidersOverride?: Record<ProviderKey, boolean>;
  }) => {
    const effectiveProviderConfigs = options?.providerConfigsOverride ?? providerConfigs;
    const effectiveEnabledProviders = options?.enabledProvidersOverride ?? enabledProviders;
    if (!targetTenantId) {
      pushToast("Selecione uma conta válida para salvar as configurações.");
      return;
    }
    if (dashboardAuthGate && !accessToken?.trim()) {
      pushToast("Faça login no painel para salvar as configurações.");
      return;
    }
    if (settingsMutationsDisabled) {
      pushToast("Seu usuário tem permissão somente leitura para esta conta.");
      return;
    }
    const invalidEnabledProvider = providerItems.find((provider) => {
      if (!effectiveEnabledProviders[provider.key]) return false;
      const config = effectiveProviderConfigs[provider.key];
      if (!config) return true;
      return !providerConfigHasRequiredFields(provider.key, config);
    });
    if (invalidEnabledProvider) {
      pushToast(`Configure ${invalidEnabledProvider.label} antes de ativar o provedor.`);
      openProviderConfig(invalidEnabledProvider.key);
      return;
    }
    const providerConfigsPayload: Record<ProviderKey, ProviderConfig | null> = {
      hotmart: effectiveProviderConfigs.hotmart
        ? {
            ...effectiveProviderConfigs.hotmart,
            enabled:
              effectiveEnabledProviders.hotmart &&
              providerConfigHasRequiredFields("hotmart", effectiveProviderConfigs.hotmart),
          }
        : null,
      kiwify: effectiveProviderConfigs.kiwify
        ? {
            ...effectiveProviderConfigs.kiwify,
            enabled:
              effectiveEnabledProviders.kiwify &&
              providerConfigHasRequiredFields("kiwify", effectiveProviderConfigs.kiwify),
          }
        : null,
      hubla: effectiveProviderConfigs.hubla
        ? {
            ...effectiveProviderConfigs.hubla,
            enabled:
              effectiveEnabledProviders.hubla &&
              providerConfigHasRequiredFields("hubla", effectiveProviderConfigs.hubla),
          }
        : null,
      generic: effectiveProviderConfigs.generic
        ? {
            ...effectiveProviderConfigs.generic,
            enabled:
              effectiveEnabledProviders.generic &&
              providerConfigHasRequiredFields("generic", effectiveProviderConfigs.generic),
          }
        : null,
    };
    setSettingsSaving(true);
    try {
      const response = await dashboardFetch(`${baseUrl}/admin/tenants/${targetTenantId}/settings`, accessToken, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          recoveryContactCooldownMinutes: tenantSettings.recoveryContactCooldownMinutes,
          recoveryContactMaxAttemptsPerDay: tenantSettings.recoveryContactMaxAttemptsPerDay,
          webhookProviderPreferred: tenantSettings.webhookProviderPreferred,
          providerConfigs: providerConfigsPayload,
        }),
      });
      const payload = (await readResponseJson(response)) as
        | {
            ok?: boolean;
            settings?: {
              integrations?: {
                currentWebhookUrl?: string | null;
                providerConfigs?: Partial<Record<ProviderKey, Partial<ProviderConfig> | null>>;
              };
            };
            error?: string;
          }
        | null
        | undefined;
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || `HTTP ${response.status}`);
      }
      const responseConfigs = payload.settings?.integrations?.providerConfigs ?? {};
      const persistedWebhookUrl =
        payload.settings?.integrations?.currentWebhookUrl ??
        responseConfigs.hotmart?.endpointUrl ??
        responseConfigs.kiwify?.endpointUrl ??
        responseConfigs.hubla?.endpointUrl ??
        responseConfigs.generic?.endpointUrl ??
        webhookUrl;
      setWebhookUrl(persistedWebhookUrl ?? "");
      setProviderConfigs({
        hotmart: providerConfigsPayload.hotmart
          ? {
              ...providerConfigsPayload.hotmart,
              endpointUrl: responseConfigs.hotmart?.endpointUrl ?? providerConfigsPayload.hotmart.endpointUrl,
            }
          : null,
        kiwify: providerConfigsPayload.kiwify
          ? {
              ...providerConfigsPayload.kiwify,
              endpointUrl: responseConfigs.kiwify?.endpointUrl ?? providerConfigsPayload.kiwify.endpointUrl,
            }
          : null,
        hubla: providerConfigsPayload.hubla
          ? {
              ...providerConfigsPayload.hubla,
              endpointUrl: responseConfigs.hubla?.endpointUrl ?? providerConfigsPayload.hubla.endpointUrl,
            }
          : null,
        generic: providerConfigsPayload.generic
          ? {
              ...providerConfigsPayload.generic,
              endpointUrl: responseConfigs.generic?.endpointUrl ?? providerConfigsPayload.generic.endpointUrl,
            }
          : null,
      });
      setEnabledProviders({
        hotmart: providerConfigsPayload.hotmart?.enabled ?? false,
        kiwify: providerConfigsPayload.kiwify?.enabled ?? false,
        hubla: providerConfigsPayload.hubla?.enabled ?? false,
        generic: providerConfigsPayload.generic?.enabled ?? false,
      });
      pushToast("Configurações salvas.");
    } catch (error) {
      pushToast(`Falha ao salvar configurações: ${error instanceof Error ? error.message : "erro desconhecido"}`);
    } finally {
      setSettingsSaving(false);
    }
  };

  const rotateWebhookUrl = async () => {
    if (!targetTenantId) {
      pushToast("Selecione uma conta válida para gerar a URL de webhook.");
      return;
    }
    if (dashboardAuthGate && !accessToken?.trim()) {
      pushToast("Faça login no painel para gerar a URL de webhook.");
      return;
    }
    if (settingsMutationsDisabled) {
      pushToast("Seu usuário tem permissão somente leitura para esta conta.");
      return;
    }
    setWebhookRotating(true);
    try {
      const response = await dashboardFetch(`${baseUrl}/admin/tenants/${targetTenantId}/webhook-token/rotate`, accessToken, {
        method: "POST",
      });
      const payload = (await readResponseJson(response)) as
        | {
            ok?: boolean;
            webhookUrl?: string;
            error?: string;
          }
        | null
        | undefined;
      if (!response.ok || !payload?.ok || !payload.webhookUrl) {
        throw new Error(payload?.error || `HTTP ${response.status}`);
      }
      setWebhookUrl(payload.webhookUrl);
      setProviderConfigs((current) => ({
        hotmart: current.hotmart ? { ...current.hotmart, endpointUrl: payload.webhookUrl! } : current.hotmart,
        kiwify: current.kiwify ? { ...current.kiwify, endpointUrl: payload.webhookUrl! } : current.kiwify,
        hubla: current.hubla ? { ...current.hubla, endpointUrl: payload.webhookUrl! } : current.hubla,
        generic: current.generic ? { ...current.generic, endpointUrl: payload.webhookUrl! } : current.generic,
      }));
      pushToast("URL de webhook gerada.");
    } catch (error) {
      pushToast(`Falha ao gerar webhook: ${error instanceof Error ? error.message : "erro desconhecido"}`);
    } finally {
      setWebhookRotating(false);
    }
  };

  const openWebhookChangeDialog = () => {
    if (!targetTenantId) {
      pushToast("Selecione uma conta válida antes de alterar a URL do webhook.");
      return;
    }
    if (settingsMutationsDisabled) {
      pushToast("Seu usuário tem permissão somente leitura para esta conta.");
      return;
    }
    setWebhookChangePassword("");
    setWebhookChangeError(null);
    setWebhookChangeDialogOpen(true);
  };

  const confirmWebhookUrlChange = async () => {
    if (!supabase || !dashboardAuthGate) {
      setWebhookChangeError("Confirmação por senha indisponível nesta instalação.");
      return;
    }
    const password = webhookChangePassword.trim();
    if (!password) {
      setWebhookChangeError("Informe sua senha para continuar.");
      return;
    }
    setWebhookChangeBusy(true);
    setWebhookChangeError(null);
    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError || !user?.email) {
        throw new Error(userError?.message || "Não foi possível identificar o usuário autenticado.");
      }
      const { error: signError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password,
      });
      if (signError) {
        throw new Error("Senha inválida.");
      }
      await rotateWebhookUrl();
      setWebhookChangeDialogOpen(false);
      setWebhookChangePassword("");
    } catch (error) {
      setWebhookChangeError(error instanceof Error ? error.message : "Falha ao validar a senha.");
    } finally {
      setWebhookChangeBusy(false);
    }
  };

  const loadMessageTemplates = useCallback(async () => {
    if (!targetTenantId) return;
    if (dashboardAuthGate && !accessToken?.trim()) return;
    setMessagesLoading(true);
    try {
      const response = await dashboardFetch(`${baseUrl}/admin/tenants/${targetTenantId}/message-templates`, accessToken);
      const payload = (await readResponseJson(response)) as {
        ok?: boolean;
        items?: DashboardMessageTemplate[];
        whatsappFlows?: DashboardWhatsappFlow[];
        messageVariants?: DashboardMessageVariant[];
        triggerCatalog?: TriggerCatalogEntry[];
        systemDefaultBody?: string;
        error?: string;
      } | null;
      if (!response.ok || !payload?.ok || !Array.isArray(payload.items)) {
        throw new Error(payload?.error || `HTTP ${response.status}`);
      }
      const items = payload.items;
      const nextFlows = Array.isArray(payload.whatsappFlows) ? payload.whatsappFlows : [];
      const nextVariants = Array.isArray(payload.messageVariants) ? payload.messageVariants : [];
      const nextCatalog = Array.isArray(payload.triggerCatalog) ? payload.triggerCatalog : [];

      setMessageTemplatesList(items);
      setWhatsappFlows(nextFlows);
      setMessageVariantsList(nextVariants);
      setTriggerCatalog(nextCatalog);

      const currentFlowId = selectedWhatsappFlowIdRef.current;
      const keptFlowId =
        currentFlowId && nextFlows.some((f) => f.id === currentFlowId)
          ? currentFlowId
          : nextFlows[0]?.id ?? null;
      setSelectedWhatsappFlowId(keptFlowId);

      const tplFromFlow =
        keptFlowId != null
          ? (() => {
              const flow = nextFlows.find((f) => f.id === keptFlowId);
              return flow ? items.find((t) => t.id === flow.messageTemplateId) : undefined;
            })()
          : undefined;

      if (tplFromFlow) {
        setMessageEditorTemplateId(tplFromFlow.id);
        setMessageEditorName(tplFromFlow.name);
        setMessageEditorBody(tplFromFlow.body);
      } else if (items[0]) {
        setMessageEditorTemplateId(items[0].id);
        setMessageEditorName(items[0].name);
        setMessageEditorBody(items[0].body);
      } else {
        setMessageEditorTemplateId(null);
        setMessageEditorName("Mensagem de recuperação");
        setMessageEditorBody(payload.systemDefaultBody ?? "");
      }
    } catch (error) {
      pushToast(`Falha ao carregar mensagens: ${error instanceof Error ? error.message : "erro desconhecido"}`);
      setMessageTemplatesList([]);
      setWhatsappFlows([]);
      setMessageVariantsList([]);
      setTriggerCatalog([]);
    } finally {
      setMessagesLoading(false);
    }
  }, [targetTenantId, accessToken, baseUrl, dashboardAuthGate]);

  const loadRecoveryLinks = useCallback(async () => {
    if (!targetTenantId) return;
    if (dashboardAuthGate && !accessToken?.trim()) return;
    setRecoveryLinksLoading(true);
    try {
      const response = await dashboardFetch(`${baseUrl}/admin/tenants/${targetTenantId}/recovery-links`, accessToken);
      const payload = (await readResponseJson(response)) as {
        ok?: boolean;
        items?: DashboardRecoveryLink[];
        error?: string;
      } | null;
      if (!response.ok || !payload?.ok || !Array.isArray(payload.items)) {
        throw new Error(payload?.error || `HTTP ${response.status}`);
      }
      setRecoveryLinksList(payload.items);
    } catch (error) {
      pushToast(`Falha ao carregar links de recuperação: ${error instanceof Error ? error.message : "erro desconhecido"}`);
      setRecoveryLinksList([]);
    } finally {
      setRecoveryLinksLoading(false);
    }
  }, [targetTenantId, accessToken, baseUrl, dashboardAuthGate]);

  const loadAdminRecoveryLinks = useCallback(async () => {
    if (!canReviewRecoveryLinks) {
      setAdminRecoveryLinksList([]);
      setAdminRecoveryLinksSummary(emptyRecoveryLinksQueueSummary());
      setAdminRecoveryLinksPagination(emptyRecoveryLinksQueuePagination());
      return;
    }
    setAdminRecoveryLinksLoading(true);
    try {
      const query = new URLSearchParams();
      if (adminReviewStatusFilter !== "all") query.set("status", adminReviewStatusFilter);
      const tenantFilter = adminReviewTenantFilter.trim();
      if (tenantFilter) query.set("tenantId", tenantFilter);
      const search = adminReviewSearch.trim();
      if (search) query.set("q", search);
      query.set("page", String(adminReviewPage));
      query.set("pageSize", String(adminRecoveryLinksPagination.pageSize));
      const response = await dashboardFetch(`${baseUrl}/conversion/recovery-links?${query.toString()}`, accessToken);
      const payload = (await readResponseJson(response)) as {
        ok?: boolean;
        items?: DashboardRecoveryLink[];
        summary?: RecoveryLinksQueueSummary;
        pagination?: RecoveryLinksQueuePagination;
        error?: string;
      } | null;
      if (!response.ok || !payload?.ok || !Array.isArray(payload.items)) {
        throw new Error(payload?.error || `HTTP ${response.status}`);
      }
      setAdminRecoveryLinksList(payload.items);
      setAdminRecoveryLinksSummary(payload.summary ?? emptyRecoveryLinksQueueSummary());
      setAdminRecoveryLinksPagination(payload.pagination ?? emptyRecoveryLinksQueuePagination());
    } catch (error) {
      pushToast(`Falha ao carregar fila de aprovação: ${error instanceof Error ? error.message : "erro desconhecido"}`);
      setAdminRecoveryLinksList([]);
      setAdminRecoveryLinksSummary(emptyRecoveryLinksQueueSummary());
      setAdminRecoveryLinksPagination(emptyRecoveryLinksQueuePagination());
    } finally {
      setAdminRecoveryLinksLoading(false);
    }
  }, [
    accessToken,
    adminRecoveryLinksPagination.pageSize,
    adminReviewPage,
    adminReviewSearch,
    adminReviewStatusFilter,
    adminReviewTenantFilter,
    baseUrl,
    canReviewRecoveryLinks,
  ]);

  const createRecoveryLink = async () => {
    if (!targetTenantId) {
      pushToast("Selecione uma conta válida.");
      return;
    }
    if (dashboardAuthGate && !accessToken?.trim()) {
      pushToast("Faça login para continuar.");
      return;
    }
    if (settingsMutationsDisabled) {
      pushToast("Seu usuário tem permissão somente leitura para esta conta.");
      return;
    }
    if (!newRecoveryLinkDraft.label.trim() || !newRecoveryLinkDraft.url.trim()) {
      pushToast("Preencha nome e URL do link.");
      return;
    }

    setRecoveryLinkCreating(true);
    try {
      const response = await dashboardFetch(`${baseUrl}/admin/tenants/${targetTenantId}/recovery-links`, accessToken, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: newRecoveryLinkDraft.label.trim(),
          url: newRecoveryLinkDraft.url.trim(),
          platform: newRecoveryLinkDraft.platform.trim() || null,
          triggerEventType: newRecoveryLinkDraft.triggerEventType.trim() || null,
          productName: newRecoveryLinkDraft.productName.trim() || null,
          active: newRecoveryLinkDraft.active,
          submittedBy: newRecoveryLinkDraft.submittedBy.trim() || null,
        }),
      });
      const payload = (await readResponseJson(response)) as { ok?: boolean; error?: string } | null;
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || `HTTP ${response.status}`);
      }
      pushToast("Link enviado para revisão.");
      setNewRecoveryLinkDraft(emptyRecoveryLinkDraft());
      await loadRecoveryLinks();
    } catch (error) {
      pushToast(`Falha ao criar link: ${error instanceof Error ? error.message : "erro desconhecido"}`);
    } finally {
      setRecoveryLinkCreating(false);
    }
  };

  const saveRecoveryLink = async (linkId: string) => {
    if (!targetTenantId) {
      pushToast("Selecione uma conta válida.");
      return;
    }
    if (dashboardAuthGate && !accessToken?.trim()) {
      pushToast("Faça login para continuar.");
      return;
    }
    if (settingsMutationsDisabled) {
      pushToast("Seu usuário tem permissão somente leitura para esta conta.");
      return;
    }

    const draft = recoveryLinkDrafts[linkId];
    if (!draft) return;
    if (!draft.label.trim() || !draft.url.trim()) {
      pushToast("Preencha nome e URL antes de salvar.");
      return;
    }

    setRecoveryLinkSavingId(linkId);
    try {
      const response = await dashboardFetch(
        `${baseUrl}/admin/tenants/${targetTenantId}/recovery-links/${linkId}`,
        accessToken,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            label: draft.label.trim(),
            url: draft.url.trim(),
            platform: draft.platform.trim() || null,
            triggerEventType: draft.triggerEventType.trim() || null,
            productName: draft.productName.trim() || null,
            active: draft.active,
            submittedBy: draft.submittedBy.trim() || null,
          }),
        },
      );
      const payload = (await readResponseJson(response)) as {
        ok?: boolean;
        error?: string;
        approvalReset?: boolean;
      } | null;
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || `HTTP ${response.status}`);
      }
      pushToast(payload?.approvalReset ? "Link alterado e reenviado para revisão." : "Link salvo.");
      await loadRecoveryLinks();
    } catch (error) {
      pushToast(`Falha ao salvar link: ${error instanceof Error ? error.message : "erro desconhecido"}`);
    } finally {
      setRecoveryLinkSavingId(null);
    }
  };

  const approveRecoveryLink = async (linkId: string) => {
    if (!canReviewRecoveryLinks || !accessToken?.trim()) {
      pushToast("Seu usuário não tem permissão operacional para aprovar links.");
      return;
    }
    const draft = recoveryLinkReviewDrafts[linkId] ?? emptyRecoveryLinkReviewDraft();
    setRecoveryLinkReviewActionId(linkId);
    try {
      const response = await dashboardFetch(`${baseUrl}/conversion/recovery-links/${linkId}/approve`, accessToken, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          approvalNote: draft.approvalNote.trim() || undefined,
        }),
      });
      const payload = (await readResponseJson(response)) as { ok?: boolean; error?: string } | null;
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || `HTTP ${response.status}`);
      }
      pushToast("Link aprovado.");
      await Promise.all([loadAdminRecoveryLinks(), loadRecoveryLinks()]);
    } catch (error) {
      pushToast(`Falha ao aprovar link: ${error instanceof Error ? error.message : "erro desconhecido"}`);
    } finally {
      setRecoveryLinkReviewActionId(null);
    }
  };

  const rejectRecoveryLink = async (linkId: string) => {
    if (!canReviewRecoveryLinks || !accessToken?.trim()) {
      pushToast("Seu usuário não tem permissão operacional para rejeitar links.");
      return;
    }
    const draft = recoveryLinkReviewDrafts[linkId] ?? emptyRecoveryLinkReviewDraft();
    if (!draft.approvalNote.trim()) {
      pushToast("Escreva o motivo da rejeição.");
      return;
    }
    setRecoveryLinkReviewActionId(linkId);
    try {
      const response = await dashboardFetch(`${baseUrl}/conversion/recovery-links/${linkId}/reject`, accessToken, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          approvalNote: draft.approvalNote.trim(),
        }),
      });
      const payload = (await readResponseJson(response)) as { ok?: boolean; error?: string } | null;
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || `HTTP ${response.status}`);
      }
      pushToast("Link rejeitado.");
      await Promise.all([loadAdminRecoveryLinks(), loadRecoveryLinks()]);
    } catch (error) {
      pushToast(`Falha ao rejeitar link: ${error instanceof Error ? error.message : "erro desconhecido"}`);
    } finally {
      setRecoveryLinkReviewActionId(null);
    }
  };

  const saveMessageTemplate = async () => {
    if (!targetTenantId) {
      pushToast("Selecione uma conta válida.");
      return;
    }
    if (dashboardAuthGate && !accessToken?.trim()) {
      pushToast("Faça login para salvar.");
      return;
    }
    if (settingsMutationsDisabled) {
      pushToast("Seu usuário tem permissão somente leitura para esta conta.");
      return;
    }
    const tid = messageEditorTemplateId;
    if (!tid) {
      pushToast("Ative um modelo personalizado antes de salvar.");
      return;
    }
    if (!messageEditorBody.trim()) {
      pushToast("O texto da mensagem não pode ficar vazio.");
      return;
    }
    setMessagesSaving(true);
    try {
      const response = await dashboardFetch(
        `${baseUrl}/admin/tenants/${targetTenantId}/message-templates/${tid}`,
        accessToken,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: messageEditorName.trim() || "Mensagem de recuperação",
            body: messageEditorBody,
          }),
        },
      );
      const payload = (await readResponseJson(response)) as {
        ok?: boolean;
        error?: string;
        template?: DashboardMessageTemplate;
      } | null;
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || `HTTP ${response.status}`);
      }
      pushToast("Mensagem salva.");
      await loadMessageTemplates();
    } catch (error) {
      pushToast(`Falha ao salvar: ${error instanceof Error ? error.message : "erro desconhecido"}`);
    } finally {
      setMessagesSaving(false);
    }
  };

  const bootstrapRecoveryMessaging = async () => {
    if (!targetTenantId) {
      pushToast("Selecione uma conta válida.");
      return;
    }
    if (dashboardAuthGate && !accessToken?.trim()) {
      pushToast("Faça login para continuar.");
      return;
    }
    if (settingsMutationsDisabled) {
      pushToast("Seu usuário tem permissão somente leitura para esta conta.");
      return;
    }
    if (!messageEditorBody.trim()) {
      pushToast("Escreva o texto da mensagem antes de ativar.");
      return;
    }
    setMessagesBootstrapping(true);
    try {
      const response = await dashboardFetch(`${baseUrl}/admin/tenants/${targetTenantId}/message-templates/bootstrap`, accessToken, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: messageEditorName.trim() || "Mensagem de recuperação",
          body: messageEditorBody,
        }),
      });
      const payload = (await readResponseJson(response)) as { ok?: boolean; error?: string } | null;
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || `HTTP ${response.status}`);
      }
      pushToast("Mensagem personalizada ativada para esta conta.");
      await loadMessageTemplates();
    } catch (error) {
      pushToast(`Falha ao ativar: ${error instanceof Error ? error.message : "erro desconhecido"}`);
    } finally {
      setMessagesBootstrapping(false);
    }
  };

  const [variantDrafts, setVariantDrafts] = useState<
    Record<string, { body: string; weight: string; label: string }>
  >({});

  const createWhatsappRecoveryFlow = async () => {
    if (!targetTenantId) {
      pushToast("Selecione uma conta válida.");
      return;
    }
    if (dashboardAuthGate && !accessToken?.trim()) {
      pushToast("Faça login para continuar.");
      return;
    }
    if (settingsMutationsDisabled) {
      pushToast("Seu usuário tem permissão somente leitura para esta conta.");
      return;
    }
    if (!newWhatsappTrigger.trim()) {
      pushToast("Escolha o tipo de evento para esta mensagem.");
      return;
    }
    setMessagesAddingFlow(true);
    try {
      const response = await dashboardFetch(
        `${baseUrl}/admin/tenants/${targetTenantId}/whatsapp-recovery-flows`,
        accessToken,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            triggerEventType: newWhatsappTrigger,
            body: messageEditorBody.trim() || undefined,
            templateName: messageEditorName.trim() || undefined,
          }),
        },
      );
      const payload = (await readResponseJson(response)) as {
        ok?: boolean;
        error?: string;
        flow?: { id: string };
      } | null;
      if (!response.ok || !payload?.ok) {
        if (payload?.error === "whatsapp_flow_already_exists") {
          pushToast("Já existe um fluxo ativo para esse gatilho.");
        } else {
          throw new Error(payload?.error || `HTTP ${response.status}`);
        }
        return;
      }
      if (payload.flow?.id) selectedWhatsappFlowIdRef.current = payload.flow.id;
      pushToast("Nova mensagem WhatsApp criada para este gatilho.");
      setNewWhatsappTrigger("");
      await loadMessageTemplates();
    } catch (error) {
      pushToast(`Falha ao criar fluxo: ${error instanceof Error ? error.message : "erro desconhecido"}`);
    } finally {
      setMessagesAddingFlow(false);
    }
  };

  const saveMessageVariant = async (variantId: string) => {
    if (!targetTenantId || !messageEditorTemplateId) {
      pushToast("Selecione um modelo antes de salvar a variação.");
      return;
    }
    if (dashboardAuthGate && !accessToken?.trim()) {
      pushToast("Faça login para continuar.");
      return;
    }
    if (settingsMutationsDisabled) {
      pushToast("Seu usuário tem permissão somente leitura para esta conta.");
      return;
    }
    const draft = variantDrafts[variantId];
    if (!draft) return;
    const weightNum = Number.parseInt(draft.weight, 10);
    if (!Number.isFinite(weightNum) || weightNum < 0) {
      pushToast("Peso da variação inválido.");
      return;
    }
    setVariantSavingId(variantId);
    try {
      const response = await dashboardFetch(
        `${baseUrl}/admin/tenants/${targetTenantId}/message-templates/${messageEditorTemplateId}/variants/${variantId}`,
        accessToken,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            label: draft.label.trim() || undefined,
            weight: weightNum,
            body: draft.body.trim() === "" ? "" : draft.body,
          }),
        },
      );
      const payload = (await readResponseJson(response)) as { ok?: boolean; error?: string } | null;
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || `HTTP ${response.status}`);
      }
      pushToast("Variação salva.");
      await loadMessageTemplates();
    } catch (error) {
      pushToast(`Falha ao salvar variação: ${error instanceof Error ? error.message : "erro desconhecido"}`);
    } finally {
      setVariantSavingId(null);
    }
  };

  useEffect(() => {
    if (activeMenu !== "messages") return;
    if (!targetTenantId.trim()) return;
    void loadMessageTemplates();
    void loadRecoveryLinks();
  }, [activeMenu, targetTenantId, loadMessageTemplates, loadRecoveryLinks]);

  useEffect(() => {
    if (activeMenu !== "operations") return;
    if (!canReviewRecoveryLinks) {
      setAdminRecoveryLinksList([]);
      setAdminRecoveryLinksSummary(emptyRecoveryLinksQueueSummary());
      setAdminRecoveryLinksPagination(emptyRecoveryLinksQueuePagination());
      return;
    }
    void loadAdminRecoveryLinks();
  }, [activeMenu, canReviewRecoveryLinks, loadAdminRecoveryLinks]);

  useEffect(() => {
    if (activeMenu === "operations" && !canReviewRecoveryLinks) {
      setActiveMenu("dashboard");
    }
  }, [activeMenu, canReviewRecoveryLinks]);

  useEffect(() => {
    if (!messageEditorTemplateId) {
      setVariantDrafts({});
      return;
    }
    const list = messageVariantsList.filter((v) => v.templateId === messageEditorTemplateId);
    setVariantDrafts(
      Object.fromEntries(
        list.map((v) => [
          v.id,
          { body: v.body ?? "", weight: String(v.weight), label: v.label },
        ]),
      ),
    );
  }, [messageEditorTemplateId, messageVariantsList]);

  useEffect(() => {
    setRecoveryLinkDrafts(
      Object.fromEntries(recoveryLinksList.map((item) => [item.id, recoveryLinkToDraft(item)])),
    );
  }, [recoveryLinksList]);

  useEffect(() => {
    setRecoveryLinkReviewDrafts(
      Object.fromEntries(
        adminRecoveryLinksList.map((item) => [
          item.id,
          {
            approvalNote: item.approvalNote ?? "",
          },
        ]),
      ),
    );
  }, [adminRecoveryLinksList]);

  const templateIdsUsedByWhatsapp = useMemo(
    () => new Set(whatsappFlows.map((f) => f.messageTemplateId)),
    [whatsappFlows],
  );

  const orphanMessageTemplates = useMemo(
    () => messageTemplatesList.filter((t) => !templateIdsUsedByWhatsapp.has(t.id)),
    [messageTemplatesList, templateIdsUsedByWhatsapp],
  );

  const triggersAvailableToAdd = useMemo(() => {
    const used = new Set(whatsappFlows.filter((f) => f.enabled).map((f) => f.triggerEventType));
    return triggerCatalog.filter((c) => !used.has(c.value));
  }, [triggerCatalog, whatsappFlows]);

  const messagesTriggerDropdownLabel = useMemo(() => {
    if (newWhatsappTrigger && triggersAvailableToAdd.some((c) => c.value === newWhatsappTrigger)) {
      return triggersAvailableToAdd.find((c) => c.value === newWhatsappTrigger)?.label ?? "Adicionar mensagem para…";
    }
    return "Adicionar mensagem para…";
  }, [newWhatsappTrigger, triggersAvailableToAdd]);

  const recoveryTriggerLabelMap = useMemo(
    () => Object.fromEntries(triggerCatalog.map((entry) => [entry.value, entry.label])),
    [triggerCatalog],
  );

  const pendingRecoveryLinksCount = useMemo(
    () => recoveryLinksList.filter((item) => item.approvalStatus === "pending_review").length,
    [recoveryLinksList],
  );

  const { messagesSceneSelectionKey, messagesSceneDropdownLabel } = useMemo(() => {
    let key = "";
    if (selectedWhatsappFlowId && whatsappFlows.some((f) => f.id === selectedWhatsappFlowId)) {
      key = `flow:${selectedWhatsappFlowId}`;
    } else if (messageEditorTemplateId && orphanMessageTemplates.some((t) => t.id === messageEditorTemplateId)) {
      key = `tpl:${messageEditorTemplateId}`;
    } else if (whatsappFlows[0]) {
      key = `flow:${whatsappFlows[0].id}`;
    } else if (messageEditorTemplateId) {
      key = `tpl:${messageEditorTemplateId}`;
    }
    let label = "—";
    if (key.startsWith("flow:")) {
      const f = whatsappFlows.find((x) => x.id === key.slice(5));
      if (f) label = `${f.triggerLabel}${f.enabled ? "" : " — inativo"} (${f.name})`;
    } else if (key.startsWith("tpl:")) {
      const t = messageTemplatesList.find((x) => x.id === key.slice(4));
      if (t) label = t.name;
    }
    return { messagesSceneSelectionKey: key, messagesSceneDropdownLabel: label };
  }, [
    selectedWhatsappFlowId,
    whatsappFlows,
    messageEditorTemplateId,
    orphanMessageTemplates,
    messageTemplatesList,
  ]);

  const handleMessagesSceneOptionPick = useCallback(
    (raw: string) => {
      if (raw.startsWith("flow:")) {
        const fid = raw.slice(5);
        setSelectedWhatsappFlowId(fid);
        const f = whatsappFlows.find((x) => x.id === fid);
        const t = f ? messageTemplatesList.find((x) => x.id === f.messageTemplateId) : undefined;
        if (t) {
          setMessageEditorTemplateId(t.id);
          setMessageEditorName(t.name);
          setMessageEditorBody(t.body);
        }
      } else if (raw.startsWith("tpl:")) {
        const tid = raw.slice(4);
        setSelectedWhatsappFlowId(null);
        const t = messageTemplatesList.find((x) => x.id === tid);
        if (t) {
          setMessageEditorTemplateId(t.id);
          setMessageEditorName(t.name);
          setMessageEditorBody(t.body);
        }
      }
      setIsMessagesSceneDropdownOpen(false);
    },
    [whatsappFlows, messageTemplatesList],
  );

  const variantsForCurrentTemplate = useMemo(
    () => messageVariantsList.filter((v) => v.templateId === messageEditorTemplateId),
    [messageVariantsList, messageEditorTemplateId],
  );

  const messageWhatsAppPreviewText = useMemo(
    () => composeRecoveryMessagePreview(messageEditorBody),
    [messageEditorBody],
  );

  const isSettingsMenu = activeMenu === "settings";
  const isDashboardMenu = activeMenu === "dashboard";
  const isAttemptsMenu = activeMenu === "attempts";
  const isIntegrationsMenu = activeMenu === "integrations";
  const isMessagesMenu = activeMenu === "messages";
  const isOperationsMenu = activeMenu === "operations";
  const isSupportMenu = activeMenu === "support";
  const isAccountMenu = activeMenu === "account";
  const needsOverviewData = isDashboardMenu || isAttemptsMenu;
  const useReferenceDashboard = true;
  const isSovereignMode = useReferenceDashboard;

  useEffect(() => {
    if (!targetTenantId) {
      setWebhookUrl("");
      setTenantSettings({
        planMonthlyEventsLimit: null,
        planMonthlyRecoveryLimit: null,
        billingPlan: null,
        recoveryContactCooldownMinutes: null,
        recoveryContactMaxAttemptsPerDay: null,
        webhookProviderPreferred: null,
      });
      setProviderConfigs({
        hotmart: null,
        kiwify: null,
        hubla: null,
        generic: null,
      });
      setEnabledProviders({
        hotmart: false,
        kiwify: false,
        hubla: false,
        generic: false,
      });
      return;
    }
    if (!(isIntegrationsMenu || isAccountMenu || isSettingsMenu)) return;
    if (dashboardAuthGate && !accessToken?.trim()) return;
    void loadTenantDashboardSettings();
  }, [
    accessToken,
    dashboardAuthGate,
    isAccountMenu,
    isIntegrationsMenu,
    isSettingsMenu,
    loadTenantDashboardSettings,
    targetTenantId,
  ]);

  const sovereignActions = [
    { label: "Recuperação via WhatsApp", icon: "chat_bubble" as const },
    { label: "Reprocessar tentativas", icon: "swap_horiz" as const },
    { label: "Alternativa de pagamento", icon: "credit_card" as const },
    { label: "Entrada de webhook", icon: "request_quote" as const },
  ] as const;

  const sidebarNavItems = [
    { key: "dashboard" as const, label: "Painel", icon: "home" },
    { key: "attempts" as const, label: "Tentativas de recuperação", icon: "receipt_long" },
    { key: "integrations" as const, label: "Integrações", icon: "credit_card" },
    { key: "messages" as const, label: "Mensagens", icon: "chat" },
    ...(canReviewRecoveryLinks
      ? ([{ key: "operations" as const, label: "Operação", icon: "verified_user" }] as const)
      : []),
    { key: "account" as const, label: "Conta", icon: "account_circle" },
    { key: "settings" as const, label: "Configurações", icon: "account_balance_wallet" },
  ];

  const onForgotPassword = async () => {
    if (!supabase) return;
    setAuthFormInfo(null);
    const email = authEmail.trim();
    if (!email) {
      setAuthFormError("Informe seu e-mail para receber o link de recuperação.");
      return;
    }
    setForgotBusy(true);
    setAuthFormError(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}${window.location.pathname}`,
    });
    setForgotBusy(false);
    if (error) setAuthFormError(error.message);
    else
      setAuthFormInfo(
        "Se este e-mail estiver cadastrado, você receberá instruções para redefinir a senha.",
      );
  };

  const onDashboardAuthSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!supabase) return;
    setAuthBusy(true);
    setAuthFormError(null);
    setAuthFormInfo(null);
    const { error: signError } = await supabase.auth.signInWithPassword({
      email: authEmail.trim(),
      password: authPassword,
    });
    setAuthBusy(false);
    if (signError) setAuthFormError(signError.message);
    else setAuthPassword("");
  };

  if (dashboardAuthGate && !isSupabaseBrowserConfigured) {
    return (
      <AuthGateChrome theme="light" eyebrow="Login indisponível" title="Não foi possível carregar o acesso">
        <p className="auth-gate-lead">
          Este endereço ainda não está liberado para entrada. Peça para quem administra a conta na sua empresa ou fale com
          o suporte.
        </p>
      </AuthGateChrome>
    );
  }

  if (dashboardAuthGate && isSupabaseBrowserConfigured && authReady && passwordRecoveryActive) {
    if (!accessToken?.trim()) {
      return (
        <AuthGateChrome theme="light" eyebrow="RecPay" title="Recuperação de senha">
          <p className="auth-gate-lead">Validando o link enviado por e-mail…</p>
        </AuthGateChrome>
      );
    }
    return (
      <AuthGateChrome theme="light" eyebrow="RecPay" title="Definir nova senha">
        <p className="auth-gate-lead">Escolha uma senha forte para acessar o painel.</p>
        <form className="auth-gate-form" onSubmit={(e) => void onPasswordRecoverySubmit(e)}>
          <label className="auth-gate-field">
            <span className="auth-gate-label">Nova senha</span>
            <input
              className="account-input"
              type="password"
              autoComplete="new-password"
              value={recoveryNewPassword}
              onChange={(e) => setRecoveryNewPassword(e.target.value)}
              placeholder="Mínimo 8 caracteres"
              required
              minLength={8}
            />
          </label>
          <label className="auth-gate-field">
            <span className="auth-gate-label">Confirmar senha</span>
            <input
              className="account-input"
              type="password"
              autoComplete="new-password"
              value={recoveryConfirmPassword}
              onChange={(e) => setRecoveryConfirmPassword(e.target.value)}
              placeholder="Repita a senha"
              required
              minLength={8}
            />
          </label>
          <button type="submit" className="btn btn-primary auth-gate-submit" disabled={recoveryBusy}>
            {recoveryBusy ? "Salvando…" : "Salvar e continuar"}
          </button>
        </form>
        {recoveryError ? (
          <p className="auth-gate-error" role="alert">
            {recoveryError}
          </p>
        ) : null}
      </AuthGateChrome>
    );
  }

  if (dashboardAuthGate && isSupabaseBrowserConfigured && authReady && !accessToken) {
    return (
      <AuthGateChrome
        theme="light"
        title="Acesse a sua conta"
        headerAside={
          <a
            className="auth-gate-ghost-btn"
            href="https://recpay.com.br"
            target="_blank"
            rel="noreferrer noopener"
          >
            Conheça o produto
          </a>
        }
      >
        <form className="auth-gate-form" onSubmit={(e) => void onDashboardAuthSubmit(e)}>
          <label className="auth-gate-field">
            <span className="auth-gate-label">E-mail</span>
            <input
              className="account-input"
              type="email"
              autoComplete="username"
              value={authEmail}
              onChange={(e) => {
                setAuthEmail(e.target.value);
                setAuthFormInfo(null);
              }}
              placeholder="voce@empresa.com.br"
              required
            />
          </label>
          <label className="auth-gate-field">
            <span className="auth-gate-label">Senha</span>
            <div className="auth-gate-password-row">
              <input
                className="account-input"
                type={showAuthPassword ? "text" : "password"}
                autoComplete="current-password"
                value={authPassword}
                onChange={(e) => {
                  setAuthPassword(e.target.value);
                  setAuthFormInfo(null);
                }}
                placeholder="••••••••"
                required
              />
              <button
                type="button"
                className="auth-gate-password-toggle"
                onClick={() => setShowAuthPassword((v) => !v)}
                aria-label={showAuthPassword ? "Ocultar senha" : "Mostrar senha"}
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  {showAuthPassword ? "visibility_off" : "visibility"}
                </span>
              </button>
            </div>
          </label>
          <div className="auth-gate-forgot-row">
            <button
              type="button"
              className="auth-gate-forgot"
              disabled={forgotBusy || authBusy}
              onClick={() => void onForgotPassword()}
            >
              {forgotBusy ? "Enviando…" : "Esqueci minha senha"}
            </button>
          </div>
          <button type="submit" className="btn btn-primary auth-gate-submit" disabled={authBusy}>
            {authBusy ? "Entrando…" : "Entrar"}
          </button>
        </form>
        {authFormInfo ? (
          <p className="auth-gate-success" role="status">
            {authFormInfo}
          </p>
        ) : null}
        {authFormError ? (
          <p className="auth-gate-error" role="alert">
            {authFormError}
          </p>
        ) : null}
      </AuthGateChrome>
    );
  }

  return (
    <div
      className={`app-shell theme-${theme} ${sidebarCollapsed ? "sidebar-collapsed" : ""} ${isSovereignMode ? "sovereign-mode" : ""} ${isSovereignMode && sovereignNavOpen ? "sovereign-nav-open" : ""}`}
    >
      <aside className="sidebar">
        <div className="brand brand-row">
          <span className="brand-mark" aria-hidden="true">
            <img src="/brand/icon-b.svg" alt="" width={36} height={36} />
          </span>
          <div className="brand-text">
            <strong>RecPay</strong>
            <small>Painel operacional</small>
          </div>
          {!isSovereignMode && (
            <button className="collapse-btn" onClick={() => setSidebarCollapsed((current) => !current)}>
              {sidebarCollapsed ? "→" : "←"}
            </button>
          )}
        </div>
        <div className="sidebar-nav-inset">
          <nav className="side-nav">
            {sidebarNavItems.map((item) => (
              <button
                key={item.key}
                className={`side-link ${activeMenu === item.key ? "active" : ""}`}
                onClick={() => navigateToMenu(item.key)}
              >
                <span className="material-symbols-outlined side-link-icon" aria-hidden="true">
                  {item.icon}
                </span>
                <span>{item.label}</span>
              </button>
            ))}
          </nav>
          <div className="sidebar-settings">
            <button className="side-link settings-trigger" onClick={() => navigateToMenu("support")}>
              <span className="material-symbols-outlined side-link-icon" aria-hidden="true">
                help
              </span>
              <span>Suporte</span>
            </button>
            <button className="side-link settings-trigger" onClick={() => navigateToMenu("settings")}>
              <span className="material-symbols-outlined side-link-icon" aria-hidden="true">
                settings
              </span>
              <span>Configurações</span>
            </button>
          </div>
        </div>
      </aside>

      {isSovereignMode && sovereignNavOpen && (
        <button
          type="button"
          className="sovereign-sidebar-backdrop"
          tabIndex={-1}
          aria-label="Fechar menu de navegação"
          onClick={() => setSovereignNavOpen(false)}
        />
      )}

      <main className="content">
        {isSovereignMode && activeMenu !== "dashboard" && !sovereignNavOpen && (
          <button
            type="button"
            className="sovereign-mobile-menu-fab"
            aria-label="Abrir menu de navegação"
            onClick={() => setSovereignNavOpen(true)}
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              menu
            </span>
          </button>
        )}
        {isDashboardMenu && useReferenceDashboard && (
          <section className="sovereign-shell" ref={dashboardTopRef}>
            <header className="sovereign-topbar">
              <div className="sovereign-topbar-toolbar">
                {isSovereignMode && (
                  <button
                    type="button"
                    className="sovereign-menu-toggle icon-btn"
                    aria-label={sovereignNavOpen ? "Fechar menu" : "Abrir menu"}
                    aria-expanded={sovereignNavOpen}
                    onClick={() => setSovereignNavOpen((open) => !open)}
                  >
                    <span className="material-symbols-outlined" aria-hidden="true">
                      {sovereignNavOpen ? "close" : "menu"}
                    </span>
                  </button>
                )}
                <div className="sovereign-search-row">
                  <div className="sovereign-search">
                    <span className="material-symbols-outlined" aria-hidden="true">
                      search
                    </span>
                    <input
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Buscar tentativas, eventos, canais..."
                    />
                  </div>
                </div>
                <div className="sovereign-top-actions">
                  <button
                    className="icon-btn"
                    aria-label="Notificações"
                    onClick={() => {
                      navigateToMenu("support");
                      pushToast("Central de suporte aberta.");
                    }}
                  >
                    <span className="material-symbols-outlined" aria-hidden="true">
                      notifications
                    </span>
                  </button>
                  <button className="icon-btn" aria-label="Histórico" onClick={() => navigateToMenu("attempts")}>
                    <span className="material-symbols-outlined" aria-hidden="true">
                      history
                    </span>
                  </button>
                  <button className="icon-btn" aria-label="Ajuda" onClick={() => navigateToMenu("support")}>
                    <span className="material-symbols-outlined" aria-hidden="true">
                      help
                    </span>
                  </button>
                  <div className="sovereign-user">
                    <button type="button" className="sovereign-user-trigger" onClick={() => navigateToMenu("account")} aria-label="Abrir conta">
                      <div>
                        <strong>Conta</strong>
                        <small>Operação</small>
                      </div>
                      <div className="sovereign-avatar" aria-hidden="true">
                        AS
                      </div>
                    </button>
                  </div>
                </div>
              </div>
            </header>

            <div className="sovereign-heading">
              <div>
                <h1>Painel de Recuperação</h1>
                <p>Recuperação de receita • Atualizado há 2 min</p>
                <div className="sovereign-range-quick" role="group" aria-label="Filtros rápidos de período">
                  <button
                    type="button"
                    className={`sovereign-range-btn ${dashboardQuickRange === "7d" ? "active" : ""}`}
                    onClick={() => applyDashboardQuickRange("7d")}
                  >
                    7 dias
                  </button>
                  <button
                    type="button"
                    className={`sovereign-range-btn ${dashboardQuickRange === "30d" ? "active" : ""}`}
                    onClick={() => applyDashboardQuickRange("30d")}
                  >
                    30 dias
                  </button>
                  <button
                    type="button"
                    className={`sovereign-range-btn ${dashboardQuickRange === "90d" ? "active" : ""}`}
                    onClick={() => applyDashboardQuickRange("90d")}
                  >
                    90 dias
                  </button>
                  <button
                    type="button"
                    className={`sovereign-range-btn ${dashboardQuickRange === "month" ? "active" : ""}`}
                    onClick={() => applyDashboardQuickRange("month")}
                  >
                    Este mês
                  </button>
                </div>
              </div>
              <div className="sovereign-heading-actions">
                <button className="btn btn-secondary" onClick={onExportCsv}>
                  Baixar relatórios
                </button>
                <button className="btn btn-primary soft" onClick={() => void refetch()} disabled={isFetching}>
                  {isFetching ? "Atualizando..." : "Atualizar dados"}
                </button>
              </div>
            </div>

            <div className="sovereign-grid">
              <article className="sovereign-balance">
                <div className="sovereign-balance-head">
                  <div>
                    <p className="sovereign-label">Valor total recuperado</p>
                    <h2>{formatCurrencyBrl(sovereignRecoveredAmount)}</h2>
                    <div className="sovereign-chip-row">
                      <span className={`pill pill-${(data?.trend7d.recoveryAttempts.delta ?? 0) >= 0 ? "success" : "danger"}`}>
                        {(data?.trend7d.recoveryAttempts.delta ?? 0) >= 0 ? "+" : ""}
                        {formatInt(data?.trend7d.recoveryAttempts.delta ?? 0)}
                      </span>
                      <small>variação nos últimos 7 dias</small>
                    </div>
                    <small>Total de recuperações no período que você filtrou no painel.</small>
                  </div>
                  <button
                    className="sovereign-more-btn"
                    aria-label="More options"
                    onClick={() => setIsViewsModalOpen(true)}
                  >
                    <span className="material-symbols-outlined" aria-hidden="true">
                      more_horiz
                    </span>
                  </button>
                </div>
                <div className="sovereign-chart">
                  <div className="sovereign-bars">
                    {(data?.timeseries.points ?? []).slice(-11).map((point, index, arr) => {
                      const localMax = Math.max(...arr.map((p) => Math.max(p.events, p.recoveryAttempts)), 1);
                      const value = Math.max(point.events, point.recoveryAttempts);
                      const normalized = Math.round((value / localMax) * 100);
                      const height = value > 0 ? Math.max(normalized, 8) : 6;
                      return (
                        <span
                          key={`bar-${point.day}-${index}`}
                          style={{
                            height: `${height}%`,
                            background: `rgba(0, 86, 195, ${0.14 + index * 0.045})`,
                            opacity: value > 0 ? 1 : 0.35,
                          }}
                          title={`${formatDate(point.day)} • eventos ${point.events} • tentativas ${point.recoveryAttempts}`}
                        />
                      );
                    })}
                  </div>
                  {((data?.timeseries.points ?? []).length === 0 ||
                    (data?.timeseries.points ?? []).every((p) => p.events === 0 && p.recoveryAttempts === 0)) && (
                    <p className="inline-help">Sem volume no período selecionado.</p>
                  )}
                </div>
              </article>

              <div className="sovereign-actions-grid">
                {sovereignActions.map(({ label, icon }) => (
                  <button key={label} className="sovereign-action-card" onClick={() => runQuickAction(label)}>
                    <div className="sovereign-action-icon">
                      <span className="material-symbols-outlined" aria-hidden="true">
                        {icon}
                      </span>
                    </div>
                    <span className="sovereign-action-label">{label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="sovereign-lower">
              <section className="sovereign-accounts">
                <div className="sovereign-section-head">
                  <h3>Canais de recuperação</h3>
                  <button onClick={() => navigateToMenu("integrations")}>Gerenciar</button>
                </div>
                <div className="sovereign-account-item">
                  <div className="sovereign-account-main">
                    <div className="sovereign-account-icon">
                      <span className="material-symbols-outlined" aria-hidden="true">
                        chat_bubble
                      </span>
                    </div>
                    <strong>Recuperação via WhatsApp</strong>
                    <small>Canal principal</small>
                  </div>
                  <div className="sovereign-account-meta">
                    <strong>{formatInt(data?.summary.byStatus.sent ?? 0)}</strong>
                    <small>Mensagens enviadas</small>
                  </div>
                </div>
                <div className="sovereign-account-item">
                  <div className="sovereign-account-main">
                    <div className="sovereign-account-icon">
                      <span className="material-symbols-outlined" aria-hidden="true">
                        credit_card
                      </span>
                    </div>
                    <strong>Alternativa de pagamento</strong>
                    <small>Fallback ativo</small>
                  </div>
                  <div className="sovereign-account-meta">
                    <strong>{formatPercent(data?.summary.totals.deliveryRate ?? null)}</strong>
                    <small>Taxa de entrega</small>
                  </div>
                </div>
                <div className="sovereign-account-item">
                  <div className="sovereign-account-main">
                    <div className="sovereign-account-icon">
                      <span className="material-symbols-outlined" aria-hidden="true">
                        data_object
                      </span>
                    </div>
                    <strong>Entrada de webhook</strong>
                    <small>Provedores configurados</small>
                  </div>
                  <div className="sovereign-account-meta">
                    <strong>{formatInt(data?.kpis.eventsTotal ?? 0)}</strong>
                    <small>Eventos recebidos</small>
                  </div>
                </div>
              </section>

              <section className="sovereign-transactions">
                <div className="sovereign-section-head">
                  <h3>Tentativas recentes</h3>
                  <div className="sovereign-section-actions">
                    <div className="re-dropdown" ref={sovereignTxFilterRef}>
                    <button
                      className={`sovereign-filter-btn re-dropdown-trigger ${isSovereignTxFilterOpen ? "open" : ""}`}
                      type="button"
                      onClick={() => setIsSovereignTxFilterOpen((c) => !c)}
                      aria-haspopup="menu"
                      aria-expanded={isSovereignTxFilterOpen}
                    >
                      <span className="material-symbols-outlined" aria-hidden="true">
                        filter_list
                      </span>
                      Filtrar
                    </button>
                    {isSovereignTxFilterOpen && (
                      <div className="re-dropdown-menu" role="menu">
                        {[
                          { key: "Falha no pagamento", label: "Falha no pagamento" },
                          { key: "Recuperação enviada", label: "Recuperação enviada" },
                        ].map((opt) => {
                          const active = sovereignTxStageFilters.includes(opt.key);
                          return (
                            <button
                              key={opt.key}
                              type="button"
                              className={`re-dropdown-option ${active ? "active" : ""}`}
                              role="menuitemcheckbox"
                              aria-checked={active}
                              onClick={() => {
                                setSovereignTxStageFilters((current) => {
                                  if (current.includes(opt.key)) return current.filter((v) => v !== opt.key);
                                  return [...current, opt.key];
                                });
                              }}
                            >
                              <span className="re-dropdown-check" aria-hidden="true" />
                              <span className="re-dropdown-option-label">{opt.label}</span>
                            </button>
                          );
                        })}
                        <button
                          type="button"
                          className="re-dropdown-option"
                          role="menuitem"
                          onClick={() => {
                            setSovereignTxStageFilters([]);
                            setIsSovereignTxFilterOpen(false);
                          }}
                        >
                          <span className="re-dropdown-check" aria-hidden="true" />
                          <span className="re-dropdown-option-label">Limpar filtros</span>
                        </button>
                      </div>
                    )}
                    </div>
                    <button onClick={() => navigateToMenu("attempts")}>Ver tudo</button>
                  </div>
                </div>
                <div className="sovereign-table-head">
                  <span>Data</span>
                  <span>Provedor</span>
                  <span>Métrica</span>
                  <span>Etapa</span>
                  <span>Valor</span>
                </div>
                {sovereignTxRows
                  .filter((row) => {
                    if (!sovereignTxStageFilters.length) return true;
                    return sovereignTxStageFilters.includes(row.method);
                  })
                  .map((row) => (
                  <div className="sovereign-row" key={`sovereign-row-${row.day}-${row.amountText}`}>
                    <span>{formatDate(row.day)}</span>
                    <span className="sovereign-merchant">
                      <span className={`sovereign-merchant-avatar ${row.amountTone === "positive" ? "positive" : ""}`}>
                        {row.amountTone === "positive" ? (
                          <span className="material-symbols-outlined" aria-hidden="true">
                            north_east
                          </span>
                        ) : (
                          row.toFrom
                            .split(" ")
                            .map((chunk) => chunk[0])
                            .join("")
                            .slice(0, 2)
                        )}
                      </span>
                      <span>{row.toFrom}</span>
                    </span>
                    <span>{row.account}</span>
                    <span>
                      <span className={`attempt-status-chip sovereign-method-chip ${row.methodChipClass}`}>
                        {row.method}
                      </span>
                    </span>
                    <span className={row.amountTone === "negative" ? "is-negative" : "is-positive"}>{row.amountText}</span>
                  </div>
                ))}
                {sovereignTxRows.length === 0 && <div className="inline-help">Sem dados para o período selecionado.</div>}
                {sovereignTxRows.length > 0 && (
                  <div className="inline-help">
                    Saldo das linhas exibidas:{" "}
                    <strong>{formatCurrencyBrl(sovereignTxRows.reduce((sum, row) => sum + row.amountValue, 0))}</strong>
                  </div>
                )}
                <div className="sovereign-load-more">
                  <button
                    onClick={() => {
                      navigateToMenu("attempts");
                      setPage((current) => current + 1);
                    }}
                  >
                    Carregar mais histórico
                  </button>
                </div>
              </section>
            </div>
            <div className="sovereign-fab">
              <button aria-label="Chat de suporte" onClick={() => navigateToMenu("support")}>
                <span className="material-symbols-outlined" aria-hidden="true">
                  chat_bubble
                </span>
              </button>
            </div>
          </section>
        )}

        {isDashboardMenu && !useReferenceDashboard && (
          <>
            <div className="workspace-bar">
              <div className="workspace-brand">
                <span className="workspace-dot" />
                <strong>RecPay</strong>
              </div>
              <div className="workspace-search">
                <MagnifyingGlass size={15} />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Buscar"
                />
              </div>
              <div className="workspace-actions">
                <button className="icon-btn">
                  <DotsThreeOutlineVertical size={16} />
                </button>
                <button className="icon-btn">
                  <Bell size={16} />
                </button>
                <button className="icon-btn">
                  <UserCircle size={18} />
                </button>
              </div>
            </div>

            <header className="topbar" ref={dashboardTopRef}>
              <div>
                <p className="eyebrow">Insights operacionais</p>
                <h1>Painel de Recuperação</h1>
                <p className="subtle">Visão executiva clara para operação e resultado de recuperação.</p>
              </div>
              <div className="topbar-actions">
                <span className="meta-chip">{selectedRangeLabel || "Sem período aplicado"}</span>
                <button
                  type="button"
                  className="btn btn-tertiary btn-icon-only"
                  aria-label="Configurar painel"
                  onClick={() => setIsViewConfigOpen((current) => !current)}
                >
                  <SlidersHorizontal size={15} weight="duotone" aria-hidden />
                </button>
                <button className="btn btn-primary soft" onClick={() => setIsViewConfigOpen(true)}>
                  <Plus size={14} />
                  Novo filtro
                </button>
                <button
                  type="button"
                  className={`btn btn-secondary btn-icon-only${isFetching ? " is-busy" : ""}`}
                  aria-label={isFetching ? "Atualizando dados" : "Atualizar dados"}
                  aria-busy={isFetching}
                  onClick={() => void refetch()}
                  disabled={isFetching}
                >
                  <ArrowsClockwise size={15} weight="duotone" aria-hidden />
                </button>
              </div>
            </header>

            <section className="surface project-tabs-surface">
              <div className="project-title-row">
                <h3>Visão geral</h3>
                <span className="subtle">Acompanhe operação, uso e recuperação.</span>
              </div>
              <div className="project-tabs">
                <button className="project-tab active">Resumo</button>
                <button className="project-tab">Lista</button>
                <button className="project-tab">Quadro</button>
                <button className="project-tab">Calendário</button>
                <button className="project-tab">Arquivos</button>
              </div>
            </section>
          </>
        )}

        {isDashboardMenu && !useReferenceDashboard && isViewConfigOpen && (
          <section className="surface view-config-surface">
            <div className="view-config-grid">
              <label className="view-select-label">
                <span>Filtro salvo</span>
                <div className="re-dropdown" ref={savedViewsSelectRef}>
                  <button
                    type="button"
                    className={`re-dropdown-trigger ${isSavedViewsSelectOpen ? "open" : ""}`}
                    onClick={() => setIsSavedViewsSelectOpen((current) => !current)}
                    aria-haspopup="listbox"
                    aria-expanded={isSavedViewsSelectOpen}
                  >
                    <span className="re-dropdown-value">
                      {selectedViewId
                        ? orderedViews.find((view) => view.id === selectedViewId)?.name ?? "Selecione..."
                        : "Selecione..."}
                    </span>
                    <span className="re-dropdown-caret material-symbols-outlined" aria-hidden="true">
                      expand_more
                    </span>
                  </button>
                  {isSavedViewsSelectOpen && (
                    <div className="re-dropdown-menu" role="listbox">
                      <button
                        type="button"
                        className={`re-dropdown-option ${selectedViewId === "" ? "active" : ""}`}
                        role="option"
                        aria-selected={selectedViewId === ""}
                        onClick={() => {
                          setSelectedViewId("");
                          setIsSavedViewsSelectOpen(false);
                        }}
                      >
                        <span className="re-dropdown-check" aria-hidden="true" />
                        <span className="re-dropdown-option-label">Selecione...</span>
                      </button>
                      {orderedViews.map((view) => {
                        const label = `${view.isFavorite ? "★ " : ""}${view.name}${defaultViewId === view.id ? " (padrão)" : ""}`;
                        const active = selectedViewId === view.id;
                        return (
                          <button
                            key={view.id}
                            type="button"
                            className={`re-dropdown-option ${active ? "active" : ""}`}
                            role="option"
                            aria-selected={active}
                            onClick={() => {
                              setSelectedViewId(view.id);
                              setIsSavedViewsSelectOpen(false);
                            }}
                          >
                            <span className="re-dropdown-check" aria-hidden="true" />
                            <span className="re-dropdown-option-label">{label}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </label>
              <input
                className="view-name-input"
                value={viewName}
                onChange={(event) => setViewName(event.target.value)}
                placeholder="Nome para salvar o filtro atual"
              />
              <button className="btn btn-tertiary" onClick={onApplyView} disabled={!selectedViewId}>
                Aplicar filtro
              </button>
              <button className="btn btn-tertiary" onClick={onSaveView} disabled={!viewName.trim()}>
                Salvar filtro
              </button>
              <button className="btn btn-tertiary" onClick={() => setIsViewsModalOpen(true)} disabled={!savedViews.length}>
                Gerenciar filtros
              </button>
            </div>
          </section>
        )}

        {isDashboardMenu && !useReferenceDashboard && (
        <section className="surface onboarding-surface">
          <h3>Selecione a conta</h3>
          <div className="first-steps">
            <strong>Primeiro acesso</strong>
            <ol>
              <li>Use o identificador da conta que a equipe RecPay enviou por e-mail ou suporte.</li>
              <li>Se não tiver o código, fale com o suporte para receber o identificador correto.</li>
              <li>Cole o identificador no campo abaixo e clique em <b>Aplicar filtros</b>.</li>
            </ol>
          </div>
          <div className="onboarding-grid">
            <label className="tenant-select-label">
              <span>Conta</span>
              {hasTenantOptions ? (
                <div className="tenant-combobox" ref={tenantComboboxRef}>
                  <span id="tenant-combobox-label" className="tenant-combobox-label">
                    Selecione uma conta
                  </span>
                  <button
                    type="button"
                    className={`tenant-combobox-trigger ${isTenantComboboxOpen ? "open" : ""}`}
                    role="combobox"
                    aria-expanded={isTenantComboboxOpen}
                    aria-haspopup="listbox"
                    aria-autocomplete="none"
                    aria-invalid={false}
                    aria-controls="tenant-combobox-listbox"
                    aria-labelledby="tenant-combobox-label"
                    onClick={() => setIsTenantComboboxOpen((current) => !current)}
                  >
                    <span>
                      {selectedTenantOption ? formatAccountIdForDisplay(selectedTenantOption) : "Selecione uma conta"}
                    </span>
                    <span className="tenant-combobox-caret material-symbols-outlined" aria-hidden="true">
                      expand_more
                    </span>
                  </button>
                  {isTenantComboboxOpen && (
                    <div className="tenant-combobox-menu" role="listbox" id="tenant-combobox-listbox">
                      <button
                        type="button"
                        className={`tenant-combobox-option ${selectedTenantOption === "" ? "active" : ""}`}
                        role="option"
                        aria-selected={selectedTenantOption === ""}
                        onClick={() => {
                          setTenantId("");
                          setIsTenantComboboxOpen(false);
                        }}
                      >
                        <span className="tenant-combobox-check" aria-hidden="true" />
                        <span className="tenant-combobox-option-label">Selecione uma conta</span>
                      </button>
                      {tenantOptions.map((option) => (
                        <button
                          key={option}
                          type="button"
                          className={`tenant-combobox-option ${selectedTenantOption === option ? "active" : ""}`}
                          role="option"
                          aria-selected={selectedTenantOption === option}
                          onClick={() => {
                            setTenantId(option);
                            setIsTenantComboboxOpen(false);
                          }}
                        >
                          <span className="tenant-combobox-check" aria-hidden="true" />
                          <span className="tenant-combobox-option-label">{formatAccountIdForDisplay(option)}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <input
                  className="tenant-select"
                  value={tenantId}
                  onChange={(event) => setTenantId(event.target.value)}
                  placeholder="Identificador da conta"
                />
              )}
            </label>
            <label className="search-label">
              <span>Busca rápida na tabela</span>
              <input
                className="search-input"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar por dia ou volume"
              />
            </label>
          </div>
          {!hasTenantOptions && (
            <p className="inline-help">
              Cole o identificador da conta no campo acima e clique em <strong>Aplicar filtros</strong>.
            </p>
          )}
        </section>
        )}

        {isDashboardMenu && !useReferenceDashboard && (
        <section className="surface filters-surface">
          <div className="filters">
            <label>
              Identificador da conta
              <input value={tenantId} onChange={(e) => setTenantId(e.target.value)} placeholder="Cole o identificador completo" />
            </label>
            <label>
              Data inicial
              <input value={from} onChange={(e) => setFrom(e.target.value)} placeholder="2026-03-01 00:00" />
            </label>
            <label>
              Data final
              <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="2026-03-31 23:59" />
            </label>
            <label>
              Nível de alerta (0 a 1)
              <input
                type="number"
                step={0.05}
                min={0}
                max={1}
                value={warningThreshold}
                onChange={(e) => setWarningThreshold(clamp01(Number(e.target.value)))}
              />
            </label>
          </div>
          <div className="filter-actions">
            <button
              className="btn btn-primary"
              onClick={() => {
                const normalizedTenant = normalizeTenantInput(tenantId);
                const normalizedFrom = normalizeDateInputToIso(from);
                const normalizedTo = normalizeDateInputToIso(to);
                if (!normalizedTenant) {
                  pushToast("Informe o identificador da conta antes de aplicar os filtros.");
                  return;
                }
                if (!isUuidV4Like(normalizedTenant)) {
                  pushToast("Identificador inválido. Confira o código completo enviado pela equipe.");
                  return;
                }
                if (accessToken?.trim() && serverTenants.length > 0 && !serverTenantIds.has(normalizedTenant)) {
                  pushToast("Conta sem acesso para este usuário. Selecione um tenant listado em seu perfil.");
                  return;
                }
                if (!normalizedFrom || !normalizedTo) {
                  pushToast("Formato de data invalido. Use AAAA-MM-DDTHH:mm ou clique em Este mes.");
                  return;
                }
                setTenantId(normalizedTenant);
                setSubmittedTenantId(normalizedTenant);
                setSubmittedFrom(normalizedFrom);
                setSubmittedTo(normalizedTo);
                setSubmittedThreshold(warningThreshold);
                setDashboardQuickRange("custom");
              }}
              disabled={!tenantId.trim()}
            >
              Aplicar filtros
            </button>
            <button
              className="btn btn-tertiary"
              onClick={() => {
                const monthFrom = startOfMonthIso();
                const monthTo = endOfDayIso();
                setFrom(monthFrom);
                setTo(monthTo);
                setSubmittedFrom(monthFrom);
                setSubmittedTo(monthTo);
                setDashboardQuickRange("month");
              }}
            >
              Este mes
            </button>
            <button
              className="btn btn-tertiary"
              onClick={() => {
                const range = last7DaysIso();
                setFrom(range.from);
                setTo(range.to);
                setSubmittedFrom(range.from);
                setSubmittedTo(range.to);
                setDashboardQuickRange("7d");
              }}
            >
              Últimos 7 dias
            </button>
          </div>
        </section>
        )}

        {activeMenu === "settings" && (
            <section className="settings-page" ref={settingsSectionRef} aria-label="Configurações">
            <header className="account-page-header">
              <span className="account-page-badge">Operação</span>
              <h1 className="account-page-title">Configurações</h1>
              <p className="account-page-lead">
                Limites, canais de recuperação e URL de integração da sua conta.
              </p>
            </header>

            <div className="settings-toolbar">
              <span className="pill pill-neutral">Configuração</span>
              <div className="filter-actions settings-actions">
                <button className="btn btn-tertiary" onClick={() => void loadTenantDashboardSettings()} disabled={settingsLoading}>
                  {settingsLoading ? "Carregando..." : "Carregar configurações"}
                </button>
                <button
                  className="btn btn-primary"
                  onClick={() => void saveTenantDashboardSettings()}
                  disabled={settingsSaving || settingsMutationsDisabled}
                >
                  {settingsSaving ? "Salvando..." : "Salvar configurações"}
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={openWebhookChangeDialog}
                  disabled={webhookRotating || settingsMutationsDisabled}
                >
                  {webhookRotating ? "Alterando..." : webhookUrl ? "Alterar URL do webhook" : "Gerar URL do webhook"}
                </button>
              </div>
            </div>

            <div className="account-bento settings-account-bento">
              <div className="account-bento-main">
                <article className="account-card">
                  <div className="account-card-head">
                    <span className="material-symbols-outlined account-card-icon" aria-hidden="true">
                      tune
                    </span>
                    <h2 className="account-card-title">Limites e integração</h2>
                  </div>
                  <div className="account-form-grid">
              <label className="account-field account-field-span2">
                <span className="account-label">Identificador da conta</span>
                <input
                  className="account-input"
                  value={tenantId}
                  onChange={(event) => setTenantId(event.target.value)}
                  placeholder="Identificador da sua conta"
                />
              </label>
              <label className="account-field account-field-span2">
                <span className="account-label">Plataforma de vendas</span>
                <div className="re-dropdown" ref={settingsWebhookProviderRef}>
                  <button
                    type="button"
                    className={`re-dropdown-trigger ${isSettingsWebhookProviderOpen ? "open" : ""}`}
                    onClick={() => setIsSettingsWebhookProviderOpen((current) => !current)}
                    aria-haspopup="listbox"
                    aria-expanded={isSettingsWebhookProviderOpen}
                    disabled={settingsMutationsDisabled}
                  >
                    <span className="re-dropdown-value">
                      {webhookProviderOptions.find((opt) => opt.value === (tenantSettings.webhookProviderPreferred ?? ""))?.label ??
                        "Automático"}
                    </span>
                    <span className="re-dropdown-caret material-symbols-outlined" aria-hidden="true">
                      expand_more
                    </span>
                  </button>
                  {isSettingsWebhookProviderOpen && (
                    <div className="re-dropdown-menu" role="listbox">
                      {webhookProviderOptions.map((opt) => {
                        const active = (tenantSettings.webhookProviderPreferred ?? "") === opt.value;
                        return (
                          <button
                            key={opt.value || "default"}
                            type="button"
                            className={`re-dropdown-option ${active ? "active" : ""}`}
                            role="option"
                            aria-selected={active}
                            onClick={() => {
                              setTenantSettings((current) => ({
                                ...current,
                                webhookProviderPreferred: (opt.value || null) as WebhookProvider | null,
                              }));
                              setIsSettingsWebhookProviderOpen(false);
                            }}
                          >
                            <span className="re-dropdown-check" aria-hidden="true" />
                            <span className="re-dropdown-option-label">{opt.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </label>
              <label className="account-field account-field-span2">
                <span className="account-label">URL atual de webhook (gerada)</span>
                <input
                  className="account-input"
                  value={webhookUrl}
                  readOnly
                  placeholder="A URL será exibida aqui"
                />
              </label>
              <p className="inline-help">
                Depois de gerada, a URL fica fixa. Qualquer alteração só pode ser feita aqui em Configurações e exige senha.
              </p>
                  </div>
                </article>
              </div>
            </div>
            {!targetTenantId && (
              <p className="inline-help">Selecione uma conta válida nos filtros para habilitar carregar e salvar.</p>
            )}
          </section>
        )}

        {needsOverviewData && !submittedTenantId.trim() && (!useReferenceDashboard || !isDashboardMenu) && (
          <section className="surface empty-state">Selecione uma conta para carregar o painel.</section>
        )}

        {needsOverviewData && isLoading && submittedTenantId.trim() && (!useReferenceDashboard || !isDashboardMenu) && (
          <>
            <section className="surface loading-state">
              <div className="spinner" />
              <p>Carregando dados do painel…</p>
            </section>
            <section className="kpi-grid">
              {Array.from({ length: 4 }).map((_, index) => (
                <article className="metric-card skeleton" key={`skeleton-kpi-${index}`}>
                  <div className="skeleton-line short" />
                  <div className="skeleton-line big" />
                  <div className="skeleton-line medium" />
                </article>
              ))}
            </section>
            <section className="panel-grid">
              <article className="surface skeleton">
                <div className="skeleton-line medium" />
                <div className="skeleton-block" />
              </article>
              <article className="surface skeleton">
                <div className="skeleton-line medium" />
                <div className="skeleton-block" />
              </article>
            </section>
          </>
        )}

        {needsOverviewData && error && (!useReferenceDashboard || !isDashboardMenu) && (
          <section className="surface error-state">
            <strong>Falha ao buscar dados.</strong>
            <p>{getDashboardErrorMessage(error, baseUrl)}</p>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ marginTop: 12 }}
              onClick={() => void refetch()}
              disabled={isFetching}
            >
              {isFetching ? "Carregando…" : "Tentar novamente"}
            </button>
          </section>
        )}

        {needsOverviewData && data && !isLoading && (
          <>
            {isDashboardMenu && !useReferenceDashboard && (
            <section className="kpi-grid">
              <article className="metric-card">
                <div className="metric-icon metric-blue">AT</div>
                <p>Total de tentativas</p>
                <h2>{formatInt(data.summary.totals.total)}</h2>
                <small>Periodo ativo</small>
              </article>
              <article className="metric-card">
                <div className="metric-icon metric-green">DL</div>
                <p>Taxa de entrega</p>
                <h2>{formatPercent(data.summary.totals.deliveryRate)}</h2>
                <small>Resultado de recuperação</small>
              </article>
              <article className="metric-card">
                <div className="metric-icon metric-amber">FP</div>
                <p>Falha de pagamento</p>
                <h2>{formatPercent(data.kpis.failureRate)}</h2>
                <small>Eventos com falha</small>
              </article>
              <article className="metric-card">
                <div className="metric-icon metric-purple">RC</div>
                <p>Recuperadas</p>
                <h2>{formatInt(data.kpis.recoveryDeliveredTotal)}</h2>
                <small>Volume convertido</small>
              </article>
            </section>
            )}

            {isAttemptsMenu && (
            <div className="attempts-page attempts-ledger-page" ref={attemptsSectionRef}>
              <header className="account-page-header">
                <span className="account-page-badge">Histórico operacional</span>
                <h1 className="account-page-title">Logs de Ações</h1>
                <p className="account-page-lead">
                  Monitoramento em tempo real de todas as atividades do sistema.
                </p>
              </header>

              <article className="account-card attempts-filters-card">
                <div className="attempts-filter-bar attempts-filter-bar--reference">
                  <div className="attempts-filter-search-wrap">
                    <span className="material-symbols-outlined attempts-filter-leading" aria-hidden="true">
                      search
                    </span>
                    <input
                      type="search"
                      className="attempts-filter-search-input"
                      value={attemptLogSearch}
                      onChange={(event) => setAttemptLogSearch(event.target.value)}
                      placeholder="Buscar por provedor ou ID"
                      aria-label="Buscar por provedor ou ID"
                    />
                  </div>
                  <div className="attempts-filter-control">
                    <span className="material-symbols-outlined attempts-filter-leading" aria-hidden="true">
                      calendar_today
                    </span>
                    <div className="re-dropdown re-dropdown-inline" ref={attemptRangeRef}>
                      <button
                        type="button"
                        className={`re-dropdown-trigger ${isAttemptRangeOpen ? "open" : ""}`}
                        onClick={() => setIsAttemptRangeOpen((current) => !current)}
                        aria-haspopup="listbox"
                        aria-expanded={isAttemptRangeOpen}
                      >
                        <span className="re-dropdown-value">
                          {attemptLogRange === "7"
                            ? "Últimos 7 dias"
                            : attemptLogRange === "30"
                              ? "Últimos 30 dias"
                              : attemptLogRange === "90"
                                ? "Últimos 90 dias"
                                : "Período completo (consulta)"}
                        </span>
                        <span className="re-dropdown-caret material-symbols-outlined" aria-hidden="true">
                          expand_more
                        </span>
                      </button>
                      {isAttemptRangeOpen && (
                        <div className="re-dropdown-menu" role="listbox">
                          {(
                            [
                              { value: "7", label: "Últimos 7 dias" },
                              { value: "30", label: "Últimos 30 dias" },
                              { value: "90", label: "Últimos 90 dias" },
                              { value: "all", label: "Período completo (consulta)" },
                            ] as const
                          ).map((opt) => {
                            const active = attemptLogRange === opt.value;
                            return (
                              <button
                                key={opt.value}
                                type="button"
                                className={`re-dropdown-option ${active ? "active" : ""}`}
                                role="option"
                                aria-selected={active}
                                onClick={() => {
                                  setAttemptLogRange(opt.value);
                                  setIsAttemptRangeOpen(false);
                                }}
                              >
                                <span className="re-dropdown-check" aria-hidden="true" />
                                <span className="re-dropdown-option-label">{opt.label}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="attempts-filter-control">
                    <span className="material-symbols-outlined attempts-filter-leading" aria-hidden="true">
                      filter_list
                    </span>
                    <div className="re-dropdown re-dropdown-inline" ref={attemptStatusRef}>
                      <button
                        type="button"
                        className={`re-dropdown-trigger ${isAttemptStatusOpen ? "open" : ""}`}
                        onClick={() => setIsAttemptStatusOpen((current) => !current)}
                        aria-haspopup="listbox"
                        aria-expanded={isAttemptStatusOpen}
                      >
                        <span className="re-dropdown-value">
                          {attemptStatusFilter === "all"
                            ? "Todos Status"
                            : attemptStatusFilter === "success"
                              ? "Sucesso"
                              : attemptStatusFilter === "failure"
                                ? "Falha"
                                : "Pendente"}
                        </span>
                        <span className="re-dropdown-caret material-symbols-outlined" aria-hidden="true">
                          expand_more
                        </span>
                      </button>
                      {isAttemptStatusOpen && (
                        <div className="re-dropdown-menu" role="listbox">
                          {[
                            { value: "all", label: "Todos Status" },
                            { value: "success", label: "Sucesso" },
                            { value: "failure", label: "Falha" },
                            { value: "pending", label: "Pendente" },
                          ].map((opt) => {
                            const active = attemptStatusFilter === opt.value;
                            return (
                              <button
                                key={opt.value}
                                type="button"
                                className={`re-dropdown-option ${active ? "active" : ""}`}
                                role="option"
                                aria-selected={active}
                                onClick={() => {
                                  setAttemptStatusFilter(opt.value as "all" | "success" | "failure" | "pending");
                                  setIsAttemptStatusOpen(false);
                                }}
                              >
                                <span className="re-dropdown-check" aria-hidden="true" />
                                <span className="re-dropdown-option-label">{opt.label}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn btn-primary attempts-filter-apply"
                    onClick={() => {
                      setAttemptLogPage(1);
                      void refetch();
                    }}
                  >
                    Filtrar
                  </button>
                </div>
              </article>

              <article className="account-card attempts-table-card">
                <div className="account-card-head attempts-table-card-head">
                  <span className="material-symbols-outlined account-card-icon" aria-hidden="true">
                    receipt_long
                  </span>
                  <h2 className="account-card-title">Registro de tentativas</h2>
                </div>
                <div className="attempts-ledger-table-wrap">
                  <div className="attempts-ledger-head-row">
                    <span>Data/Hora</span>
                    <span>Provedor</span>
                    <span>Canal</span>
                    <span>Status</span>
                    <span>Valor</span>
                    <span>Motivo</span>
                  </div>
                  {attemptActionsLoading && (
                    <div className="attempts-ledger-row empty-row">
                      <span>-</span>
                      <span>Carregando ações...</span>
                      <span>-</span>
                      <span>-</span>
                      <span>-</span>
                      <span>-</span>
                    </div>
                  )}
                  {!attemptActionsLoading &&
                    pagedAttemptActions.map((row) => {
                      const ch = row.channel.toLowerCase();
                      const channelIcon =
                        ch.includes("whatsapp") || ch.includes("zap")
                          ? "chat"
                          : ch.includes("mail")
                            ? "mail"
                            : "podcasts";
                      const isPending = row.actionLabel === "Agendada";
                      const chipClass =
                        row.tone === "negative" ? "is-failure" : isPending ? "is-pending" : "is-success";
                      const chipLabel = row.tone === "negative" ? "FALHA" : isPending ? "PENDENTE" : "SUCESSO";
                      const providerLabel =
                        row.provider.length > 1
                          ? row.provider.charAt(0).toUpperCase() + row.provider.slice(1).toLowerCase()
                          : row.provider;
                      const providerKey = normalizeProviderKey(row.provider);
                      return (
                        <div className="attempts-ledger-row" key={row.id}>
                          <span className="attempts-cell-muted">{formatDateTime(row.createdAt)}</span>
                          <span className="attempt-provider">
                            <span className={`attempt-provider-avatar attempt-provider-avatar-${providerKey}`}>
                              {row.provider.slice(0, 2).toUpperCase()}
                            </span>
                            <span>{providerLabel}</span>
                          </span>
                          <span className="attempt-channel">
                            <span className="material-symbols-outlined attempt-channel-icon" aria-hidden="true">
                              {channelIcon}
                            </span>
                            {row.channel}
                          </span>
                          <span>
                            <span className={`attempt-status-chip ${chipClass}`}>{chipLabel}</span>
                          </span>
                          <span className={row.tone === "negative" ? "is-negative" : "is-positive"}>
                            {`${row.tone === "negative" ? "-" : "+"}${formatCurrencyBrl(row.amount)}`}
                          </span>
                          <span className="attempts-cell-reason">{row.reason}</span>
                        </div>
                      );
                    })}
                  {!attemptActionsLoading && !pagedAttemptActions.length && (
                    <div className="attempts-ledger-row empty-row">
                      <span>-</span>
                      <span>Nenhuma ação para os filtros atuais</span>
                      <span>-</span>
                      <span>-</span>
                      <span>-</span>
                      <span>-</span>
                    </div>
                  )}
                </div>

                <footer className="attempts-pagination-bar attempts-table-card-footer">
                  <p className="attempts-pagination-meta">
                    Mostrando{" "}
                    <strong>
                      {filteredAttemptActions.length === 0
                        ? 0
                        : (attemptSafePage - 1) * pageSize + 1}{" "}
                      - {Math.min(attemptSafePage * pageSize, filteredAttemptActions.length)}
                    </strong>{" "}
                    de <strong>{formatInt(filteredAttemptActions.length)}</strong> logs
                  </p>
                  <div className="attempts-pagination-actions">
                    <div className="attempts-page-size-group">
                      <span className="attempts-page-size-caption">Linhas</span>
                      <div className="re-dropdown re-dropdown-compact attempts-page-size-dropdown" ref={pageSizeRef}>
                        <button
                          type="button"
                          className={`re-dropdown-trigger ${isPageSizeOpen ? "open" : ""}`}
                          onClick={() => setIsPageSizeOpen((current) => !current)}
                          aria-label="Linhas por página"
                          aria-haspopup="listbox"
                          aria-expanded={isPageSizeOpen}
                        >
                          <span className="re-dropdown-value">{String(pageSize)}</span>
                          <span className="re-dropdown-caret material-symbols-outlined" aria-hidden="true">
                            expand_more
                          </span>
                        </button>
                        {isPageSizeOpen && (
                          <div className="re-dropdown-menu" role="listbox">
                            {pageSizeOptions.map((opt) => {
                              const active = String(pageSize) === opt.value;
                              return (
                                <button
                                  key={opt.value}
                                  type="button"
                                  className={`re-dropdown-option ${active ? "active" : ""}`}
                                  role="option"
                                  aria-selected={active}
                                  onClick={() => {
                                    setPageSize(Number(opt.value));
                                    setAttemptLogPage(1);
                                    setIsPageSizeOpen(false);
                                  }}
                                >
                                  <span className="re-dropdown-check" aria-hidden="true" />
                                  <span className="re-dropdown-option-label">{opt.label}</span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn btn-tertiary"
                      onClick={() => setAttemptLogPage((current) => Math.max(current - 1, 1))}
                      disabled={attemptSafePage <= 1}
                    >
                      Anterior
                    </button>
                    <div className="attempts-page-number-list" role="navigation" aria-label="Páginas">
                      {attemptLogPageList.map((entry, idx) =>
                        entry === "gap" ? (
                          <span key={`gap-${idx}`} className="attempts-page-gap" aria-hidden="true">
                            …
                          </span>
                        ) : (
                          <button
                            key={entry}
                            type="button"
                            className={`attempts-page-num ${entry === attemptSafePage ? "is-active" : ""}`}
                            onClick={() => setAttemptLogPage(entry)}
                            aria-current={entry === attemptSafePage ? "page" : undefined}
                          >
                            {entry}
                          </button>
                        ),
                      )}
                    </div>
                    <button
                      type="button"
                      className="btn btn-tertiary"
                      onClick={() =>
                        setAttemptLogPage((current) => Math.min(current + 1, attemptTotalPages))
                      }
                      disabled={attemptSafePage >= attemptTotalPages}
                    >
                      Próximo
                    </button>
                    <button
                      type="button"
                      className="btn btn-tertiary"
                      onClick={() => {
                        if (!filteredAttemptActions.length) return;
                        const rows = [
                          ["created_at", "provider", "channel", "status", "amount", "reason"],
                          ...filteredAttemptActions.map((r) => {
                            const pend = r.actionLabel === "Agendada";
                            const st = r.tone === "negative" ? "FALHA" : pend ? "PENDENTE" : "SUCESSO";
                            return [r.createdAt, r.provider, r.channel, st, String(r.amount), r.reason];
                          }),
                        ];
                        const csv = rows
                          .map((line) => line.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","))
                          .join("\n");
                        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
                        const url = URL.createObjectURL(blob);
                        const link = document.createElement("a");
                        link.href = url;
                        link.download = `tentativas-recuperacao-${Date.now()}.csv`;
                        link.click();
                        URL.revokeObjectURL(url);
                      }}
                      disabled={!filteredAttemptActions.length}
                    >
                      Exportar CSV
                    </button>
                  </div>
                </footer>
              </article>

              <div className="attempts-summary-grid" aria-label="Resumo operacional">
                <article className="attempts-summary-card attempts-summary-card--rate">
                  <span className="material-symbols-outlined attempts-summary-watermark" aria-hidden="true">
                    check_circle
                  </span>
                  <p className="attempts-summary-label">Taxa de sucesso</p>
                  <p className="attempts-summary-value">
                    {attemptLogStats.successRate === null ? "—" : `${attemptLogStats.successRate.toFixed(1)}%`}
                  </p>
                  <p className="attempts-summary-foot subtle">
                    Baseado em {formatInt(attemptLogStats.settled)} tentativas concluídas no filtro atual (
                    {formatInt(attemptLogStats.total)} registros).
                  </p>
                </article>
                <article className="attempts-summary-card attempts-summary-card--latency">
                  <span className="material-symbols-outlined attempts-summary-watermark" aria-hidden="true">
                    bolt
                  </span>
                  <p className="attempts-summary-label">Latência média</p>
                  <p className="attempts-summary-value">—</p>
                  <p className="attempts-summary-foot subtle">Indisponível no momento.</p>
                </article>
                <article className="attempts-summary-card attempts-summary-card--alerts">
                  <span className="material-symbols-outlined attempts-summary-watermark" aria-hidden="true">
                    priority_high
                  </span>
                  <p className="attempts-summary-label">Alertas de erro</p>
                  <p className="attempts-summary-value attempts-summary-alert">
                    <span className="attempts-summary-alert-count">
                      {String(attemptLogStats.failuresToday).padStart(2, "0")}
                    </span>{" "}
                    <span className="attempts-summary-alert-word">Crítico</span>
                  </p>
                  <p className="attempts-summary-foot subtle">Falhas registradas hoje (fuso local) no filtro atual.</p>
                </article>
              </div>
            </div>
            )}

          </>
        )}

        {isIntegrationsMenu && (
          <section className="integrations-page" ref={integrationsSectionRef} aria-label="Integrações">
            <header className="account-page-header">
              <span className="account-page-badge">Canais e provedores</span>
              <h1 className="account-page-title">Integrações</h1>
              <p className="account-page-lead">
                Conecte checkout, receba notificações e defina o canal de recuperação ativo.
              </p>
            </header>

            <div className="integration-toolbar">
              <span className="pill pill-warning">Configuração parcial</span>
              <div className="integration-header-actions">
                <button className="btn btn-tertiary" onClick={() => void loadTenantDashboardSettings()} disabled={settingsLoading}>
                  {settingsLoading ? "Carregando..." : "Carregar configurações"}
                </button>
                <button
                  className="btn btn-primary"
                  onClick={() => void saveTenantDashboardSettings()}
                  disabled={settingsSaving || settingsMutationsDisabled}
                >
                  {settingsSaving ? "Salvando..." : "Salvar integrações"}
                </button>
              </div>
            </div>

            <div className="integration-layout">
              <div className="integration-main">
                <div className="integration-block">
                  <h4>Provedores disponíveis</h4>
                  <div className="provider-grid">
                    {providerItems.map((provider) => (
                      <article key={provider.key} className="provider-card">
                        <div className="provider-card-head">
                          <div className="provider-brand">
                            <div className={`provider-logo ${provider.logoClass}`}>{provider.logoText}</div>
                            <div>
                              <strong>{provider.label}</strong>
                              <small>{provider.subtitle}</small>
                            </div>
                          </div>
                          <button
                            type="button"
                            className={`provider-toggle ${enabledProviders[provider.key] ? "on" : ""}`}
                            aria-pressed={enabledProviders[provider.key]}
                            onClick={() => {
                              if (enabledProviders[provider.key]) {
                                setEnabledProviders((current) => ({
                                  ...current,
                                  [provider.key]: false,
                                }));
                                setProviderConfigs((current) => ({
                                  ...current,
                                  [provider.key]: current[provider.key]
                                    ? { ...current[provider.key]!, enabled: false }
                                    : current[provider.key],
                                }));
                                return;
                              }
                              if (!providerConfigHasRequiredFields(provider.key, providerConfigs[provider.key])) {
                                pushToast(`Configure ${provider.label} antes de ativar o provedor.`);
                                openProviderConfig(provider.key);
                                return;
                              }
                              setEnabledProviders((current) => ({
                                ...current,
                                [provider.key]: true,
                              }));
                              setProviderConfigs((current) => ({
                                ...current,
                                [provider.key]: current[provider.key]
                                  ? { ...current[provider.key]!, enabled: true }
                                  : current[provider.key],
                              }));
                            }}
                          >
                            <span className="provider-toggle-thumb" />
                          </button>
                        </div>
                        <div className="provider-card-foot">
                          <span className={isProviderConnected(provider.key) ? "is-online" : "is-offline"}>
                            {isProviderConnected(provider.key)
                              ? "Conectado"
                              : providerConfigHasRequiredFields(provider.key, providerConfigs[provider.key])
                                ? "Configurado"
                                : "Pendente"}
                          </span>
                          <div className="provider-actions">
                            <button
                              className="btn btn-tertiary"
                              onClick={() => openProviderConfig(provider.key)}
                            >
                              Configurar
                            </button>
                            <button
                              className="btn btn-tertiary"
                              onClick={() => runProviderConnectionTest(provider.key)}
                              disabled={!isProviderConnected(provider.key)}
                            >
                              Testar
                            </button>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                </div>

                <div className="integration-duo">
                  <article className="integration-block">
                    <h4>Plataforma de vendas</h4>
                    <div className="filters integrations-config-grid integrations-config-grid--single">
                      <label>
                        Onde você recebe as vendas
                        <div className="re-dropdown" ref={integrationsProviderRef}>
                          <button
                            type="button"
                            className={`re-dropdown-trigger ${isIntegrationsProviderOpen ? "open" : ""}`}
                            onClick={() => setIsIntegrationsProviderOpen((current) => !current)}
                            aria-haspopup="listbox"
                            aria-expanded={isIntegrationsProviderOpen}
                            disabled={settingsMutationsDisabled}
                          >
                            <span className="re-dropdown-value">
                              {webhookProviderOptions.find((opt) => opt.value === (tenantSettings.webhookProviderPreferred ?? ""))?.label ??
                                "Automático"}
                            </span>
                            <span className="re-dropdown-caret material-symbols-outlined" aria-hidden="true">
                              expand_more
                            </span>
                          </button>
                          {isIntegrationsProviderOpen && (
                            <div className="re-dropdown-menu" role="listbox">
                              {webhookProviderOptions
                                .filter((opt) => opt.value === "" || isProviderConnected(opt.value as WebhookProvider))
                                .map((opt) => {
                                  const active = (tenantSettings.webhookProviderPreferred ?? "") === opt.value;
                                  return (
                                    <button
                                      key={opt.value || "default"}
                                      type="button"
                                      className={`re-dropdown-option ${active ? "active" : ""}`}
                                      role="option"
                                      aria-selected={active}
                                      onClick={() => {
                                        setTenantSettings((current) => ({
                                          ...current,
                                          webhookProviderPreferred: (opt.value || null) as WebhookProvider | null,
                                        }));
                                        setIsIntegrationsProviderOpen(false);
                                      }}
                                    >
                                      <span className="re-dropdown-check" aria-hidden="true" />
                                      <span className="re-dropdown-option-label">{opt.label}</span>
                                    </button>
                                  );
                                })}
                            </div>
                          )}
                        </div>
                      </label>
                    </div>
                  </article>

                  <article className="integration-block">
                    <h4>Configuração de webhook</h4>
                    <label>
                      URL do webhook
                      <input value={webhookUrl} readOnly placeholder="A URL gerada aparecerá aqui" />
                    </label>
                    <div className="filter-actions settings-actions">
                      <button
                        className="btn btn-tertiary"
                        onClick={async () => {
                          if (!webhookUrl.trim()) {
                            pushToast("Gere a URL antes de copiar.");
                            return;
                          }
                          await navigator.clipboard.writeText(webhookUrl);
                          pushToast("URL copiada.");
                        }}
                        disabled={!webhookUrl.trim()}
                      >
                        Copiar URL
                      </button>
                    </div>
                    <p className="inline-help">
                      Aviso: mantenha a URL segura. Ela permite entrada de dados no fluxo de recuperação.
                    </p>
                    <p className="inline-help">Para alterar a URL, use o menu Configurações e confirme com sua senha.</p>
                  </article>
                </div>
              </div>

              <aside className="integration-readiness">
                <h4>Prontidão</h4>
                <ul>
                  <li className={targetTenantId ? "ok" : "todo"}>Conta vinculada</li>
                  <li className={providerItems.some((provider) => isProviderConnected(provider.key)) ? "ok" : "todo"}>Provedor ativo</li>
                  <li className={tenantSettings.webhookProviderPreferred ? "ok" : "todo"}>Plataforma de vendas definida</li>
                  <li className={webhookUrl ? "ok" : "todo"}>URL gerada</li>
                  <li className={!settingsSaving ? "ok" : "todo"}>Salvo</li>
                </ul>
              </aside>
            </div>
            {providerModalOpen && providerEditing && (
              <div className="views-modal-backdrop" onClick={() => setProviderModalOpen(false)}>
                <section className="views-modal surface integration-modal" onClick={(event) => event.stopPropagation()}>
                  <div className="views-modal-head">
                    <div>
                      <h3>Configurar {providerItems.find((p) => p.key === providerEditing)?.label}</h3>
                      <p>Informe os dados de integração e ative o provedor para receber webhooks.</p>
                    </div>
                    <button className="btn btn-tertiary" onClick={() => setProviderModalOpen(false)}>
                      Fechar
                    </button>
                  </div>
                  <div className="filters integrations-config-grid">
                    {providerEditing === "generic" && (
                      <label>
                        {providerFieldCopy(providerEditing).apiKeyLabel}
                        <input
                          value={providerConfigDraft.apiKey}
                          onChange={(event) =>
                            setProviderConfigDraft((current) => ({
                              ...current,
                              apiKey: event.target.value,
                            }))
                          }
                          placeholder={providerFieldCopy(providerEditing).apiKeyPlaceholder}
                        />
                      </label>
                    )}
                    {providerEditing !== "hotmart" && (
                      <label>
                        {providerFieldCopy(providerEditing).webhookTokenLabel}
                        <input
                          value={providerConfigDraft.webhookToken}
                          onChange={(event) =>
                            setProviderConfigDraft((current) => ({
                              ...current,
                              webhookToken: event.target.value,
                            }))
                          }
                          placeholder={providerFieldCopy(providerEditing).webhookTokenPlaceholder}
                        />
                      </label>
                    )}
                    {providerEditing !== "hubla" ? (
                      <label>
                        URL de retorno (callback)
                        <input
                          value={providerConfigDraft.endpointUrl}
                          onChange={(event) =>
                            setProviderConfigDraft((current) => ({
                              ...current,
                              endpointUrl: event.target.value,
                            }))
                          }
                          placeholder="https://api.seudominio.com/webhooks/..."
                        />
                      </label>
                    ) : (
                      <p className="inline-help">
                        A URL do webhook é gerada em Configurações e aplicada automaticamente à Hubla.
                      </p>
                    )}
                  </div>
                  <div className="filter-actions settings-actions">
                    <button
                      className="btn btn-secondary"
                      onClick={() => {
                        setProviderConfigDraft((current) => ({ ...current, enabled: true }));
                        pushToast("Provedor marcado para ativacao. Salve a configuracao.");
                      }}
                      disabled={!providerConfigHasRequiredFields(providerEditing, providerConfigDraft)}
                    >
                      Ativar provedor
                    </button>
                    <button className="btn btn-tertiary" onClick={() => runProviderConnectionTest(providerEditing)}>
                      Testar conexão
                    </button>
                    <button
                      className="btn btn-primary"
                      onClick={async () => {
                        if (providerConfigDraft.enabled && !providerConfigHasRequiredFields(providerEditing, providerConfigDraft)) {
                          pushToast(providerFieldCopy(providerEditing).missingFieldsMessage);
                          return;
                        }
                        const nextProviderConfigs = {
                          ...providerConfigs,
                          [providerEditing]: {
                            ...providerConfigDraft,
                            enabled: providerConfigDraft.enabled,
                          },
                        };
                        const nextEnabledProviders = {
                          ...enabledProviders,
                          [providerEditing]: providerConfigDraft.enabled,
                        };
                        setProviderConfigs(nextProviderConfigs);
                        setEnabledProviders(nextEnabledProviders);
                        await saveTenantDashboardSettings({
                          providerConfigsOverride: nextProviderConfigs,
                          enabledProvidersOverride: nextEnabledProviders,
                        });
                        setProviderModalOpen(false);
                      }}
                    >
                      Salvar configuração
                    </button>
                  </div>
                  <p className="inline-help">Use as credenciais fornecidas pela plataforma e a URL publicada em Integrações.</p>
                </section>
              </div>
            )}
          </section>
        )}

        {isMessagesMenu && (
          <section
            className="integrations-page messages-page"
            ref={messagesSectionRef}
            aria-label="Mensagens WhatsApp"
          >
            <header className="account-page-header">
              <span className="account-page-badge">Conteúdo</span>
              <h1 className="account-page-title">Mensagens WhatsApp</h1>
              <p className="account-page-lead">
                Personalize cada texto enviado ao cliente pelo WhatsApp conforme o gatilho (falha, pendência, aprovação, etc.). Respeite as regras do WhatsApp e da LGPD.
              </p>
            </header>

            <div className="integration-toolbar integration-toolbar--messages">
              <div className="integration-header-actions integration-header-actions--messages">
                <button type="button" className="btn btn-tertiary" onClick={() => void loadMessageTemplates()} disabled={messagesLoading}>
                  {messagesLoading ? "Carregando..." : "Recarregar"}
                </button>
                {messageEditorTemplateId ? (
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => void saveMessageTemplate()}
                    disabled={messagesSaving || messagesLoading || settingsMutationsDisabled}
                  >
                    {messagesSaving ? "Salvando..." : "Salvar mensagem"}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => void bootstrapRecoveryMessaging()}
                    disabled={messagesBootstrapping || messagesLoading || settingsMutationsDisabled}
                  >
                    {messagesBootstrapping ? "Ativando..." : "Ativar mensagem personalizada"}
                  </button>
                )}
                {triggersAvailableToAdd.length > 0 ? (
                  <>
                    <div className="re-dropdown messages-toolbar-re-dropdown" ref={messagesTriggerDropdownRef}>
                      <button
                        type="button"
                        className={`re-dropdown-trigger ${isMessagesTriggerDropdownOpen ? "open" : ""}`}
                        aria-label="Gatilho para nova mensagem WhatsApp"
                        aria-haspopup="listbox"
                        aria-expanded={isMessagesTriggerDropdownOpen}
                        disabled={messagesLoading || settingsMutationsDisabled}
                        onClick={() => setIsMessagesTriggerDropdownOpen((current) => !current)}
                      >
                        <span className="re-dropdown-value">{messagesTriggerDropdownLabel}</span>
                        <span className="re-dropdown-caret material-symbols-outlined" aria-hidden="true">
                          expand_more
                        </span>
                      </button>
                      {isMessagesTriggerDropdownOpen ? (
                        <div className="re-dropdown-menu" role="listbox">
                          <button
                            type="button"
                            className={`re-dropdown-option ${newWhatsappTrigger === "" ? "active" : ""}`}
                            role="option"
                            aria-selected={newWhatsappTrigger === ""}
                            onClick={() => {
                              setNewWhatsappTrigger("");
                              setIsMessagesTriggerDropdownOpen(false);
                            }}
                          >
                            <span className="re-dropdown-check" aria-hidden="true" />
                            <span className="re-dropdown-option-label">Adicionar mensagem para…</span>
                          </button>
                          {triggersAvailableToAdd.map((c) => {
                            const active = newWhatsappTrigger === c.value;
                            return (
                              <button
                                key={c.value}
                                type="button"
                                className={`re-dropdown-option ${active ? "active" : ""}`}
                                role="option"
                                aria-selected={active}
                                onClick={() => {
                                  setNewWhatsappTrigger(c.value);
                                  setIsMessagesTriggerDropdownOpen(false);
                                }}
                              >
                                <span className="re-dropdown-check" aria-hidden="true" />
                                <span className="re-dropdown-option-label">{c.label}</span>
                              </button>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      className="btn btn-secondary messages-toolbar-create-flow-btn"
                      title="Criar mensagem para este gatilho"
                      disabled={
                        !newWhatsappTrigger || messagesAddingFlow || messagesLoading || settingsMutationsDisabled
                      }
                      onClick={() => void createWhatsappRecoveryFlow()}
                    >
                      {messagesAddingFlow ? "Criando…" : "Criar para este gatilho"}
                    </button>
                  </>
                ) : null}
              </div>
            </div>

            <div className="account-bento settings-account-bento messages-editor-bento" style={{ marginTop: 16 }}>
              <div className="account-bento-main">
                <article className="account-card">
                  <div className="account-card-head">
                    <span className="material-symbols-outlined account-card-icon" aria-hidden="true">
                      sms
                    </span>
                    <h2 className="account-card-title">Texto enviado ao cliente</h2>
                  </div>
                  {whatsappFlows.length > 0 || orphanMessageTemplates.length > 0 ? (
                    <label className="account-field account-field-span2">
                      <span className="account-label">Qual mensagem editar</span>
                      <div className="re-dropdown" ref={messagesSceneDropdownRef}>
                        <button
                          type="button"
                          className={`re-dropdown-trigger ${isMessagesSceneDropdownOpen ? "open" : ""}`}
                          aria-haspopup="listbox"
                          aria-expanded={isMessagesSceneDropdownOpen}
                          disabled={settingsMutationsDisabled}
                          onClick={() => setIsMessagesSceneDropdownOpen((current) => !current)}
                        >
                          <span className="re-dropdown-value">{messagesSceneDropdownLabel}</span>
                          <span className="re-dropdown-caret material-symbols-outlined" aria-hidden="true">
                            expand_more
                          </span>
                        </button>
                        {isMessagesSceneDropdownOpen ? (
                          <div className="re-dropdown-menu" role="listbox">
                            {whatsappFlows.length > 0 ? (
                              <>
                                <div className="re-dropdown-group-label">Envio automático (WhatsApp)</div>
                                {whatsappFlows.map((f) => {
                                  const optKey = `flow:${f.id}`;
                                  const active = messagesSceneSelectionKey === optKey;
                                  return (
                                    <button
                                      key={optKey}
                                      type="button"
                                      className={`re-dropdown-option ${active ? "active" : ""}`}
                                      role="option"
                                      aria-selected={active}
                                      onClick={() => handleMessagesSceneOptionPick(optKey)}
                                    >
                                      <span className="re-dropdown-check" aria-hidden="true" />
                                      <span className="re-dropdown-option-label">
                                        {f.triggerLabel}
                                        {!f.enabled ? " — inativo" : ""} ({f.name})
                                      </span>
                                    </button>
                                  );
                                })}
                              </>
                            ) : null}
                            {orphanMessageTemplates.length > 0 ? (
                              <>
                                <div className="re-dropdown-group-label">Modelos sem fluxo ativo</div>
                                {orphanMessageTemplates.map((t) => {
                                  const optKey = `tpl:${t.id}`;
                                  const active = messagesSceneSelectionKey === optKey;
                                  return (
                                    <button
                                      key={optKey}
                                      type="button"
                                      className={`re-dropdown-option ${active ? "active" : ""}`}
                                      role="option"
                                      aria-selected={active}
                                      onClick={() => handleMessagesSceneOptionPick(optKey)}
                                    >
                                      <span className="re-dropdown-check" aria-hidden="true" />
                                      <span className="re-dropdown-option-label">{t.name}</span>
                                    </button>
                                  );
                                })}
                              </>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </label>
                  ) : messageTemplatesList.length > 1 ? (
                    <label className="account-field account-field-span2">
                      <span className="account-label">Modelo</span>
                      <div className="re-dropdown" ref={messagesSceneDropdownRef}>
                        <button
                          type="button"
                          className={`re-dropdown-trigger ${isMessagesSceneDropdownOpen ? "open" : ""}`}
                          aria-haspopup="listbox"
                          aria-expanded={isMessagesSceneDropdownOpen}
                          disabled={settingsMutationsDisabled}
                          onClick={() => setIsMessagesSceneDropdownOpen((current) => !current)}
                        >
                          <span className="re-dropdown-value">
                            {messageTemplatesList.find((x) => x.id === messageEditorTemplateId)?.name ?? "Selecione…"}
                          </span>
                          <span className="re-dropdown-caret material-symbols-outlined" aria-hidden="true">
                            expand_more
                          </span>
                        </button>
                        {isMessagesSceneDropdownOpen ? (
                          <div className="re-dropdown-menu" role="listbox">
                            {messageTemplatesList.map((t) => {
                              const active = messageEditorTemplateId === t.id;
                              return (
                                <button
                                  key={t.id}
                                  type="button"
                                  className={`re-dropdown-option ${active ? "active" : ""}`}
                                  role="option"
                                  aria-selected={active}
                                  onClick={() => {
                                    setMessageEditorTemplateId(t.id);
                                    setMessageEditorName(t.name);
                                    setMessageEditorBody(t.body);
                                    setIsMessagesSceneDropdownOpen(false);
                                  }}
                                >
                                  <span className="re-dropdown-check" aria-hidden="true" />
                                  <span className="re-dropdown-option-label">{t.name}</span>
                                </button>
                              );
                            })}
                          </div>
                        ) : null}
                      </div>
                    </label>
                  ) : null}
                  <label className="account-field account-field-span2">
                    <span className="account-label">Nome interno do modelo</span>
                    <input
                      className="account-input"
                      value={messageEditorName}
                      onChange={(event) => setMessageEditorName(event.target.value)}
                      disabled={settingsMutationsDisabled}
                    />
                  </label>
                  <label className="account-field account-field-span2">
                    <span className="account-label">Mensagem</span>
                    <textarea
                      ref={messageEditorBodyRef}
                      className="account-input"
                      rows={9}
                      value={messageEditorBody}
                      onChange={(event) => {
                        setMessageEditorBody(event.target.value);
                        const t = event.target;
                        messageBodyCaretRef.current = { start: t.selectionStart, end: t.selectionEnd };
                      }}
                      onSelect={(event) => {
                        const t = event.currentTarget;
                        messageBodyCaretRef.current = { start: t.selectionStart, end: t.selectionEnd };
                      }}
                      onKeyUp={(event) => {
                        const t = event.currentTarget;
                        messageBodyCaretRef.current = { start: t.selectionStart, end: t.selectionEnd };
                      }}
                      onMouseUp={(event) => {
                        const t = event.currentTarget;
                        messageBodyCaretRef.current = { start: t.selectionStart, end: t.selectionEnd };
                      }}
                      onBlur={(event) => {
                        const t = event.currentTarget;
                        messageBodyCaretRef.current = { start: t.selectionStart, end: t.selectionEnd };
                      }}
                      disabled={settingsMutationsDisabled}
                    />
                  </label>
                  <div className="account-field account-field-span2">
                    <span className="account-label">Variáveis (clique para inserir na mensagem)</span>
                    <div className="message-var-chips" role="group" aria-label="Variáveis — inserir na mensagem">
                      {RECOVERY_PLACEHOLDER_CLIPBOARD_ITEMS.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          className="message-var-chip"
                          title={item.title}
                          disabled={settingsMutationsDisabled}
                          onClick={() => insertRecoveryPlaceholder(item.copy)}
                        >
                          <code>{item.chipLabel}</code>
                        </button>
                      ))}
                    </div>
                  </div>
                  {variantsForCurrentTemplate.length > 0 ? (
                    <div className="account-field account-field-span2">
                      <span className="account-label">Variações A/B (uma é escolhida aleatoriamente conforme o peso)</span>
                      <div className="message-variants-list">
                        {variantsForCurrentTemplate.map((v) => {
                          const d = variantDrafts[v.id];
                          if (!d) return null;
                          return (
                            <div
                              key={v.id}
                              className="message-variant-block"
                              style={{
                                marginTop: 12,
                                padding: "12px 14px",
                                borderRadius: 8,
                                border: "1px solid color-mix(in srgb, var(--border-subtle, #ccc) 80%, transparent)",
                              }}
                            >
                              <label className="account-field">
                                <span className="account-label">Rótulo</span>
                                <input
                                  className="account-input"
                                  value={d.label}
                                  disabled={settingsMutationsDisabled}
                                  onChange={(event) =>
                                    setVariantDrafts((prev) => ({
                                      ...prev,
                                      [v.id]: { ...d, label: event.target.value },
                                    }))
                                  }
                                />
                              </label>
                              <label className="account-field">
                                <span className="account-label">Peso</span>
                                <input
                                  className="account-input"
                                  type="number"
                                  min={0}
                                  value={d.weight}
                                  disabled={settingsMutationsDisabled}
                                  onChange={(event) =>
                                    setVariantDrafts((prev) => ({
                                      ...prev,
                                      [v.id]: { ...d, weight: event.target.value },
                                    }))
                                  }
                                />
                              </label>
                              <label className="account-field account-field-span2">
                                <span className="account-label">Texto (vazio = igual à mensagem principal acima)</span>
                                <textarea
                                  className="account-input"
                                  rows={4}
                                  value={d.body}
                                  disabled={settingsMutationsDisabled}
                                  onChange={(event) =>
                                    setVariantDrafts((prev) => ({
                                      ...prev,
                                      [v.id]: { ...d, body: event.target.value },
                                    }))
                                  }
                                />
                              </label>
                              <button
                                type="button"
                                className="btn btn-secondary"
                                disabled={settingsMutationsDisabled || variantSavingId === v.id}
                                onClick={() => void saveMessageVariant(v.id)}
                              >
                                {variantSavingId === v.id ? "Salvando…" : "Salvar variação"}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                </article>
              </div>
              <aside className="account-bento-aside" aria-label="Pré-visualização WhatsApp">
                <article className="account-card wa-preview-card">
                  <div className="account-card-head">
                    <span className="material-symbols-outlined account-card-icon" aria-hidden="true">
                      smartphone
                    </span>
                    <h2 className="account-card-title">No WhatsApp do cliente</h2>
                  </div>
                  <p className="inline-help subtle wa-preview-disclaimer">
                    Simulação com dados fictícios (Maria Silva, valor R$ 97,00, link e pedido de exemplo). O visual é aproximado do aplicativo.
                  </p>
                  <div className="wa-device" role="img" aria-label="Pré-visualização da conversa">
                    <div className="wa-device-toolbar">
                      <span className="material-symbols-outlined wa-device-back" aria-hidden="true">
                        arrow_back
                      </span>
                      <div className="wa-device-peer">
                        <div className="wa-device-avatar" aria-hidden="true">
                          RE
                        </div>
                        <div className="wa-device-peer-text">
                          <span className="wa-device-peer-name">Sua empresa</span>
                          <span className="wa-device-peer-status">online</span>
                        </div>
                      </div>
                      <span className="material-symbols-outlined wa-device-icon" aria-hidden="true">
                        videocam
                      </span>
                      <span className="material-symbols-outlined wa-device-icon" aria-hidden="true">
                        call
                      </span>
                      <span className="material-symbols-outlined wa-device-icon" aria-hidden="true">
                        more_vert
                      </span>
                    </div>
                    <div className="wa-device-chat">
                      <div className="wa-date-pill">Hoje</div>
                      <div className="wa-bubble-row wa-bubble-row--out">
                        <div className="wa-bubble wa-bubble--out">
                          <p
                            className={`wa-bubble-body ${messageWhatsAppPreviewText ? "" : "wa-bubble-body--placeholder"}`}
                          >
                            {messageWhatsAppPreviewText ? messageWhatsAppPreviewText : "Digite a mensagem ao lado para ver a simulação."}
                          </p>
                          <div className="wa-bubble-meta">
                            <span className="wa-bubble-time">14:32</span>
                            <span className="material-symbols-outlined wa-bubble-check" aria-hidden="true">
                              done_all
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </article>
              </aside>
            </div>

            <div className="account-bento settings-account-bento recovery-links-bento" style={{ marginTop: 16 }}>
              <div className="account-bento-main">
                <article className="account-card">
                  <div className="account-card-head">
                    <span className="material-symbols-outlined account-card-icon" aria-hidden="true">
                      link
                    </span>
                    <h2 className="account-card-title">Links de recuperação</h2>
                  </div>
                  <p className="inline-help subtle">
                    Cadastre aqui os links de recuperação que podem ser usados nas mensagens. Cada link passa por revisão antes
                    de ficar disponível no fluxo.
                  </p>
                  <div className="filter-actions settings-actions" style={{ marginTop: 12 }}>
                    <button
                      type="button"
                      className="btn btn-tertiary"
                      onClick={() => void loadRecoveryLinks()}
                      disabled={recoveryLinksLoading}
                    >
                      {recoveryLinksLoading ? "Carregando..." : "Recarregar links"}
                    </button>
                  </div>

                  <h3 className="recovery-link-section-title">Enviar novo link</h3>
                  <p className="inline-help subtle recovery-link-section-lead">
                    Preencha os dados abaixo e envie para análise. Campos opcionais ajudam a equipe a validar o contexto do link.
                  </p>
                  <div className="recovery-link-create-grid">
                    <label className="account-field">
                      <span className="account-label">Nome interno</span>
                      <input
                        className="account-input"
                        value={newRecoveryLinkDraft.label}
                        onChange={(event) =>
                          setNewRecoveryLinkDraft((current) => ({ ...current, label: event.target.value }))
                        }
                        disabled={settingsMutationsDisabled}
                        placeholder="Ex.: Checkout de recuperacao no cartao"
                      />
                    </label>
                    <label className="account-field">
                      <span className="account-label">Plataforma</span>
                      <input
                        className="account-input"
                        value={newRecoveryLinkDraft.platform}
                        onChange={(event) =>
                          setNewRecoveryLinkDraft((current) => ({ ...current, platform: event.target.value }))
                        }
                        disabled={settingsMutationsDisabled}
                        placeholder="Hotmart, Kiwify, Hubla..."
                      />
                    </label>
                    <label className="account-field account-field-span2">
                      <span className="account-label">URL do link</span>
                      <input
                        className="account-input"
                        value={newRecoveryLinkDraft.url}
                        onChange={(event) =>
                          setNewRecoveryLinkDraft((current) => ({ ...current, url: event.target.value }))
                        }
                        disabled={settingsMutationsDisabled}
                        placeholder="https://..."
                      />
                    </label>
                    <label className="account-field">
                      <span className="account-label">Gatilho</span>
                      <select
                        className="account-input"
                        value={newRecoveryLinkDraft.triggerEventType}
                        onChange={(event) =>
                          setNewRecoveryLinkDraft((current) => ({
                            ...current,
                            triggerEventType: event.target.value,
                          }))
                        }
                        disabled={settingsMutationsDisabled}
                      >
                        <option value="">Todos os gatilhos de recuperação</option>
                        {triggerCatalog.map((entry) => (
                          <option key={entry.value} value={entry.value}>
                            {entry.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="account-field">
                      <span className="account-label">Produto/oferta</span>
                      <input
                        className="account-input"
                        value={newRecoveryLinkDraft.productName}
                        onChange={(event) =>
                          setNewRecoveryLinkDraft((current) => ({ ...current, productName: event.target.value }))
                        }
                        disabled={settingsMutationsDisabled}
                        placeholder="Opcional"
                      />
                    </label>
                    <label className="account-field">
                      <span className="account-label">Responsável</span>
                      <input
                        className="account-input"
                        value={newRecoveryLinkDraft.submittedBy}
                        onChange={(event) =>
                          setNewRecoveryLinkDraft((current) => ({ ...current, submittedBy: event.target.value }))
                        }
                        disabled={settingsMutationsDisabled}
                        placeholder="Seu nome ou responsavel pelo link"
                      />
                    </label>
                    <div className="recovery-link-active-toggle account-field-span2">
                      <div className="recovery-link-active-toggle-copy">
                        <p className="recovery-link-active-toggle-title">Ativar quando aprovado</p>
                        <p className="recovery-link-active-toggle-desc">
                          Se ligado, o link passa a ser usado nas mensagens após a aprovação. A ordem entre vários links
                          continua com a operação, não aqui.
                        </p>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={newRecoveryLinkDraft.active}
                        aria-label="Ativar quando aprovado"
                        disabled={settingsMutationsDisabled}
                        className={`recovery-link-switch ${newRecoveryLinkDraft.active ? "recovery-link-switch--on" : ""}`}
                        onClick={() =>
                          setNewRecoveryLinkDraft((current) => ({ ...current, active: !current.active }))
                        }
                      >
                        <span className="recovery-link-switch-thumb" aria-hidden="true" />
                      </button>
                    </div>
                  </div>

                  <div className="filter-actions settings-actions" style={{ marginTop: 12 }}>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => void createRecoveryLink()}
                      disabled={recoveryLinkCreating || settingsMutationsDisabled}
                    >
                      {recoveryLinkCreating ? "Enviando..." : "Enviar link para revisão"}
                    </button>
                  </div>

                  <div className="recovery-links-list">
                    {recoveryLinksList.length === 0 ? (
                      <div className="recovery-link-empty" role="status">
                        <span className="material-symbols-outlined recovery-link-empty-icon" aria-hidden="true">
                          link_off
                        </span>
                        <p className="recovery-link-empty-title">Nenhum link cadastrado</p>
                        <p className="recovery-link-empty-text">Preencha o formulário acima e envie para revisão.</p>
                      </div>
                    ) : (
                      recoveryLinksList.map((item) => {
                        const draft = recoveryLinkDrafts[item.id];
                        if (!draft) return null;
                        return (
                          <section key={item.id} className="recovery-link-item">
                            <div className="recovery-link-item-head">
                              <div>
                                <strong>{item.label}</strong>
                                <p className="inline-help subtle">
                                  Atualizado em {formatDateTime(item.updatedAt)}
                                  {item.platform ? ` • ${item.platform}` : ""}
                                </p>
                              </div>
                              <span className={`pill pill-${recoveryLinkStatusTone(item.approvalStatus)}`}>
                                {recoveryLinkStatusLabel(item.approvalStatus)}
                              </span>
                            </div>
                            <div className="recovery-link-edit-grid">
                              <label className="account-field">
                                <span className="account-label">Nome interno</span>
                                <input
                                  className="account-input"
                                  value={draft.label}
                                  onChange={(event) =>
                                    setRecoveryLinkDrafts((current) => ({
                                      ...current,
                                      [item.id]: { ...draft, label: event.target.value },
                                    }))
                                  }
                                  disabled={settingsMutationsDisabled}
                                />
                              </label>
                              <label className="account-field">
                                <span className="account-label">Plataforma</span>
                                <input
                                  className="account-input"
                                  value={draft.platform}
                                  onChange={(event) =>
                                    setRecoveryLinkDrafts((current) => ({
                                      ...current,
                                      [item.id]: { ...draft, platform: event.target.value },
                                    }))
                                  }
                                  disabled={settingsMutationsDisabled}
                                />
                              </label>
                              <label className="account-field account-field-span2">
                                <span className="account-label">URL do link</span>
                                <input
                                  className="account-input"
                                  value={draft.url}
                                  onChange={(event) =>
                                    setRecoveryLinkDrafts((current) => ({
                                      ...current,
                                      [item.id]: { ...draft, url: event.target.value },
                                    }))
                                  }
                                  disabled={settingsMutationsDisabled}
                                />
                              </label>
                              <label className="account-field">
                                <span className="account-label">Gatilho</span>
                                <select
                                  className="account-input"
                                  value={draft.triggerEventType}
                                  onChange={(event) =>
                                    setRecoveryLinkDrafts((current) => ({
                                      ...current,
                                      [item.id]: { ...draft, triggerEventType: event.target.value },
                                    }))
                                  }
                                  disabled={settingsMutationsDisabled}
                                >
                                  <option value="">Todos os gatilhos de recuperação</option>
                                  {triggerCatalog.map((entry) => (
                                    <option key={entry.value} value={entry.value}>
                                      {entry.label}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <label className="account-field">
                                <span className="account-label">Produto/oferta</span>
                                <input
                                  className="account-input"
                                  value={draft.productName}
                                  onChange={(event) =>
                                    setRecoveryLinkDrafts((current) => ({
                                      ...current,
                                      [item.id]: { ...draft, productName: event.target.value },
                                    }))
                                  }
                                  disabled={settingsMutationsDisabled}
                                />
                              </label>
                              <label className="account-field">
                                <span className="account-label">Responsável</span>
                                <input
                                  className="account-input"
                                  value={draft.submittedBy}
                                  onChange={(event) =>
                                    setRecoveryLinkDrafts((current) => ({
                                      ...current,
                                      [item.id]: { ...draft, submittedBy: event.target.value },
                                    }))
                                  }
                                  disabled={settingsMutationsDisabled}
                                />
                              </label>
                              <label className="account-field account-field--checkbox">
                                <span className="account-label">Ativo</span>
                                <input
                                  type="checkbox"
                                  checked={draft.active}
                                  onChange={(event) =>
                                    setRecoveryLinkDrafts((current) => ({
                                      ...current,
                                      [item.id]: { ...draft, active: event.target.checked },
                                    }))
                                  }
                                  disabled={settingsMutationsDisabled}
                                />
                              </label>
                            </div>
                            <div className="recovery-link-meta">
                              <span>
                                Escopo:{" "}
                                {draft.triggerEventType
                                  ? recoveryTriggerLabelMap[draft.triggerEventType] ?? draft.triggerEventType
                                  : "todos os gatilhos"}
                              </span>
                              <span>Ordem na fila (operação): {item.priority}</span>
                              {item.reviewedAt ? (
                                <span>
                                  Revisado em {formatDateTime(item.reviewedAt)}
                                  {item.reviewedBy ? ` por ${item.reviewedBy}` : ""}
                                </span>
                              ) : null}
                              {item.approvalNote ? <span>Observação: {item.approvalNote}</span> : null}
                            </div>
                            <div className="filter-actions settings-actions">
                              <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={() => void saveRecoveryLink(item.id)}
                                disabled={settingsMutationsDisabled || recoveryLinkSavingId === item.id}
                              >
                                {recoveryLinkSavingId === item.id ? "Salvando..." : "Salvar link"}
                              </button>
                            </div>
                          </section>
                        );
                      })
                    )}
                  </div>
                </article>
              </div>
              <aside className="account-bento-aside" aria-label="Resumo dos links">
                <article className="account-card">
                  <div className="account-card-head">
                    <span className="material-symbols-outlined account-card-icon" aria-hidden="true">
                      verified_user
                    </span>
                    <h2 className="account-card-title">Fluxo de aprovação</h2>
                  </div>
                  <p className="inline-help subtle">
                    Aqui voce acompanha o andamento das revisoes. A aprovacao final e feita pela equipe interna antes do link
                    entrar em uso.
                  </p>
                  <div className="recovery-link-approval-stats">
                    <div className="attempts-summary-card">
                      <p className="attempts-summary-label">Pendentes</p>
                      <p className="attempts-summary-value">{pendingRecoveryLinksCount}</p>
                      <p className="attempts-summary-foot">Aguardando validacao da operacao antes de entrar no disparo.</p>
                    </div>
                    <div className="attempts-summary-card">
                      <p className="attempts-summary-label">Aprovados</p>
                      <p className="attempts-summary-value">
                        {recoveryLinksList.filter((item) => item.approvalStatus === "approved").length}
                      </p>
                      <p className="attempts-summary-foot">
                        Links liberados para entrar na mensagem quando o evento acontecer.
                      </p>
                    </div>
                  </div>
                </article>
              </aside>
            </div>
          </section>
        )}

        {isOperationsMenu && (
          <section className="integrations-page messages-page" aria-label="Operação e aprovação">
            <header className="account-page-header">
              <span className="account-page-badge">Operação</span>
              <h1 className="account-page-title">Aprovação de links</h1>
              <p className="account-page-lead">
                Área interna para validar os links cadastrados pelos clientes antes de liberá-los para uso nos fluxos de recuperação.
              </p>
            </header>

            <div className="account-bento settings-account-bento recovery-links-bento" style={{ marginTop: 16 }}>
              <div className="account-bento-main">
                <article className="account-card">
                  <div className="account-card-head">
                    <span className="material-symbols-outlined account-card-icon" aria-hidden="true">
                      admin_panel_settings
                    </span>
                    <h2 className="account-card-title">Fila operacional</h2>
                  </div>
                  <p className="inline-help subtle">
                    A revisão usa a sessão autenticada do painel. Só usuários com permissão operacional conseguem listar, aprovar e rejeitar links.
                  </p>
                  <div className="recovery-link-create-grid" style={{ marginTop: 12 }}>
                    <label className="account-field">
                      <span className="account-label">Status</span>
                      <select
                        className="account-input"
                        value={adminReviewStatusFilter}
                        onChange={(event) =>
                          setAdminReviewStatusFilter(event.target.value as RecoveryLinkApprovalStatus | "all")
                        }
                      >
                        <option value="all">Todos</option>
                        <option value="pending_review">Pendentes</option>
                        <option value="approved">Aprovados</option>
                        <option value="rejected">Rejeitados</option>
                      </select>
                    </label>
                    <label className="account-field">
                      <span className="account-label">Tenant</span>
                      <input
                        className="account-input"
                        value={adminReviewTenantFilter}
                        onChange={(event) => setAdminReviewTenantFilter(event.target.value)}
                        placeholder="Filtrar por tenant"
                      />
                    </label>
                    <label className="account-field account-field-span2">
                      <span className="account-label">Busca</span>
                      <input
                        className="account-input"
                        value={adminReviewSearch}
                        onChange={(event) => setAdminReviewSearch(event.target.value)}
                        placeholder="Buscar por nome, URL, produto ou plataforma"
                      />
                    </label>
                  </div>
                  <div className="filter-actions settings-actions" style={{ marginTop: 12 }}>
                    <button
                      type="button"
                      className="btn btn-tertiary"
                      onClick={() => void loadAdminRecoveryLinks()}
                      disabled={adminRecoveryLinksLoading}
                    >
                      {adminRecoveryLinksLoading ? "Carregando..." : "Atualizar fila"}
                    </button>
                  </div>
                  {!canReviewRecoveryLinks ? (
                    <p className="inline-help subtle">Seu usuário não tem permissão operacional para revisar links.</p>
                  ) : adminRecoveryLinksList.length === 0 ? (
                    <p className="inline-help subtle">Nenhum link encontrado para o filtro atual.</p>
                  ) : (
                    <div className="recovery-links-list">
                      {adminRecoveryLinksList.map((item) => {
                        const draft = recoveryLinkReviewDrafts[item.id] ?? emptyRecoveryLinkReviewDraft();
                        return (
                          <section key={item.id} className="recovery-link-item recovery-link-item--review">
                            <div className="recovery-link-item-head">
                              <div>
                                <strong>{item.label}</strong>
                                <p className="inline-help subtle">
                                  {item.platform ? `${item.platform} • ` : ""}
                                  {item.tenantName ? `${item.tenantName} • ` : ""}
                                  Tenant {item.tenantId.slice(0, 8)}… • enviado em {formatDateTime(item.createdAt)}
                                </p>
                              </div>
                              <span className={`pill pill-${recoveryLinkStatusTone(item.approvalStatus)}`}>
                                {recoveryLinkStatusLabel(item.approvalStatus)}
                              </span>
                            </div>
                            <div className="recovery-link-meta">
                              <span>
                                Gatilho:{" "}
                                {item.triggerEventType
                                  ? recoveryTriggerLabelMap[item.triggerEventType] ?? item.triggerEventType
                                  : "todos"}
                              </span>
                              <span>Produto: {item.productName || "não informado"}</span>
                              <span>Ordem na fila: {item.priority}</span>
                              <span>{item.active ? "Ativo" : "Inativo"}</span>
                              <span>Enviado por: {item.submittedBy || "não informado"}</span>
                            </div>
                            <label className="account-field account-field-span2" style={{ marginTop: 12 }}>
                              <span className="account-label">URL</span>
                              <input className="account-input" value={item.url} readOnly />
                            </label>
                            <label className="account-field account-field-span2" style={{ marginTop: 12 }}>
                              <span className="account-label">Observação da revisão</span>
                              <textarea
                                className="account-input"
                                rows={4}
                                value={draft.approvalNote}
                                onChange={(event) =>
                                  setRecoveryLinkReviewDrafts((current) => ({
                                    ...current,
                                    [item.id]: { ...draft, approvalNote: event.target.value },
                                  }))
                                }
                                placeholder="Motivo da aprovação ou rejeição"
                              />
                            </label>
                            <div className="filter-actions settings-actions" style={{ marginTop: 12 }}>
                              {item.approvalStatus === "pending_review" ? (
                                <>
                                  <button
                                    type="button"
                                    className="btn btn-secondary"
                                    onClick={() => void approveRecoveryLink(item.id)}
                                    disabled={recoveryLinkReviewActionId === item.id}
                                  >
                                    {recoveryLinkReviewActionId === item.id ? "Processando..." : "Aprovar"}
                                  </button>
                                  <button
                                    type="button"
                                    className="btn btn-tertiary"
                                    onClick={() => void rejectRecoveryLink(item.id)}
                                    disabled={recoveryLinkReviewActionId === item.id}
                                  >
                                    {recoveryLinkReviewActionId === item.id ? "Processando..." : "Rejeitar"}
                                  </button>
                                </>
                              ) : (
                                <p className="inline-help subtle">
                                  {item.reviewedBy ? `Revisado por ${item.reviewedBy}` : "Revisão registrada"}
                                  {item.reviewedAt ? ` em ${formatDateTime(item.reviewedAt)}` : ""}
                                  {item.approvalNote ? ` • ${item.approvalNote}` : ""}
                                </p>
                              )}
                            </div>
                          </section>
                        );
                      })}
                    </div>
                  )}
                  {canReviewRecoveryLinks && adminRecoveryLinksPagination.totalPages > 1 ? (
                    <div className="filter-actions settings-actions" style={{ marginTop: 16 }}>
                      <button
                        type="button"
                        className="btn btn-tertiary"
                        onClick={() => setAdminReviewPage((current) => Math.max(1, current - 1))}
                        disabled={adminRecoveryLinksLoading || adminRecoveryLinksPagination.page <= 1}
                      >
                        Página anterior
                      </button>
                      <span className="inline-help subtle">
                        Página {adminRecoveryLinksPagination.page} de {adminRecoveryLinksPagination.totalPages}
                      </span>
                      <button
                        type="button"
                        className="btn btn-tertiary"
                        onClick={() =>
                          setAdminReviewPage((current) =>
                            Math.min(adminRecoveryLinksPagination.totalPages, current + 1),
                          )
                        }
                        disabled={
                          adminRecoveryLinksLoading ||
                          adminRecoveryLinksPagination.page >= adminRecoveryLinksPagination.totalPages
                        }
                      >
                        Próxima página
                      </button>
                    </div>
                  ) : null}
                </article>
              </div>

              <aside className="account-bento-aside" aria-label="Resumo operacional">
                <article className="account-card">
                  <div className="account-card-head">
                    <span className="material-symbols-outlined account-card-icon" aria-hidden="true">
                      insights
                    </span>
                    <h2 className="account-card-title">Resumo da fila</h2>
                  </div>
                  <div className="recovery-link-approval-stats">
                    <div className="attempts-summary-card">
                      <small>Pendentes</small>
                      <strong>{adminRecoveryLinksSummary.pendingReview}</strong>
                      <p>Links aguardando revisão operacional antes de entrar no disparo.</p>
                    </div>
                    <div className="attempts-summary-card">
                      <small>Aprovados</small>
                      <strong>{adminRecoveryLinksSummary.approved}</strong>
                      <p>
                        {adminRecoveryLinksSummary.rejected} rejeitados • {adminRecoveryLinksSummary.all} no escopo atual
                      </p>
                    </div>
                    <div className="attempts-summary-card">
                      <small>Filtro ativo</small>
                      <strong>{adminReviewStatusFilter === "all" ? "Todos" : recoveryLinkStatusLabel(adminReviewStatusFilter)}</strong>
                      <p>
                        {adminReviewTenantFilter.trim()
                          ? `Tenant filtrado: ${adminReviewTenantFilter.trim()}`
                          : adminReviewSearch.trim()
                            ? `Busca: ${adminReviewSearch.trim()}`
                            : "Fila global sem recorte manual"}
                      </p>
                    </div>
                  </div>
                </article>
              </aside>
            </div>
          </section>
        )}

        {isSupportMenu && (
          <section className="surface" aria-label="Suporte">
            <div className="surface-head">
              <h3>Suporte</h3>
              <span className="pill pill-neutral">Ajuda</span>
            </div>
            <p className="subtle">
              Precisa de ajuda com integrações, tentativas ou configurações? Use os atalhos abaixo.
            </p>
            <div className="panel-grid">
              <article className="surface">
                <h3>Checklist rápido</h3>
                <ul className="subtle" style={{ margin: 0, paddingLeft: 18 }}>
                  <li>Confirme se a conta correta está selecionada e se o período do painel faz sentido.</li>
                  <li>Em Integrações, verifique se o provedor e o webhook estão ativos.</li>
                  <li>Em Mensagens, personalize o texto de recuperação; em Configurações, carregue e salve outras opções da conta.</li>
                </ul>
              </article>
              <article className="surface">
                <h3>Atalhos</h3>
                <div className="filter-actions" style={{ gap: 8 }}>
                  <button className="btn btn-tertiary" onClick={() => navigateToMenu("settings")}>
                    Ir para Configurações
                  </button>
                  <button className="btn btn-tertiary" onClick={() => navigateToMenu("attempts")}>
                    Ver Tentativas
                  </button>
                  <button className="btn btn-secondary" onClick={() => window.open("mailto:suporte@recpay.com.br", "_blank")}>
                    Falar com suporte
                  </button>
                </div>
              </article>
            </div>
          </section>
        )}

        {isAccountMenu && (
          <>
            <section className="account-page" ref={accountSectionRef} aria-label="Conta">
              <header className="account-page-header">
                <span className="account-page-badge">Perfil e limites</span>
                <h1 className="account-page-title">Conta</h1>
                <p className="account-page-lead">Gerencie dados de contato, empresa, limites e uso desta conta.</p>
              </header>

              <div className="account-bento">
                <div className="account-bento-main">
                  <article className="account-card">
                    <div className="account-card-head">
                      <span className="material-symbols-outlined account-card-icon" aria-hidden="true">
                        contact_mail
                      </span>
                      <h2 className="account-card-title">Dados de contato</h2>
                    </div>
                    <div className="account-form-grid">
                      <label className="account-field account-field-span2">
                        <span className="account-label">Nome responsável</span>
                        <input
                          className="account-input"
                          value={accountContact.responsibleName}
                          onChange={(event) => setAccountContact((c) => ({ ...c, responsibleName: event.target.value }))}
                          placeholder="Ex.: Ricardo Santos"
                        />
                      </label>
                      <label className="account-field">
                        <span className="account-label">E-mail</span>
                        <input
                          className="account-input"
                          value={accountContact.email}
                          onChange={(event) => setAccountContact((c) => ({ ...c, email: event.target.value }))}
                          placeholder="contato@empresa.com.br"
                          type="email"
                          autoComplete="email"
                        />
                      </label>
                      <label className="account-field">
                        <span className="account-label">Telefone</span>
                        <input
                          className="account-input"
                          value={accountContact.phone}
                          onChange={(event) => setAccountContact((c) => ({ ...c, phone: event.target.value }))}
                          placeholder="(11) 99999-9999"
                          type="tel"
                        />
                      </label>
                      <label className="account-field">
                        <span className="account-label">WhatsApp</span>
                        <input
                          className="account-input"
                          value={accountContact.whatsapp}
                          onChange={(event) => setAccountContact((c) => ({ ...c, whatsapp: event.target.value }))}
                          placeholder="+55 (11) 99999-9999"
                          type="tel"
                        />
                      </label>
                      <label className="account-field">
                        <span className="account-label">Cargo</span>
                        <input
                          className="account-input"
                          value={accountContact.role}
                          onChange={(event) => setAccountContact((c) => ({ ...c, role: event.target.value }))}
                          placeholder="Diretor de Operações"
                        />
                      </label>
                    </div>
                  </article>

                  <article className="account-card">
                    <div className="account-card-head">
                      <span className="material-symbols-outlined account-card-icon" aria-hidden="true">
                        business
                      </span>
                      <h2 className="account-card-title">Perfil da empresa</h2>
                    </div>
                    <div className="account-form-grid">
                      <label className="account-field account-field-span2">
                        <span className="account-label">Nome da empresa</span>
                        <input
                          className="account-input"
                          value={accountCompany.companyName}
                          onChange={(event) => setAccountCompany((c) => ({ ...c, companyName: event.target.value }))}
                          placeholder="Razão / Nome fantasia"
                        />
                      </label>
                      <label className="account-field">
                        <span className="account-label">CNPJ</span>
                        <input
                          className="account-input"
                          value={accountCompany.cnpj}
                          onChange={(event) => setAccountCompany((c) => ({ ...c, cnpj: event.target.value }))}
                          placeholder="00.000.000/0001-00"
                        />
                      </label>
                      <label className="account-field">
                        <span className="account-label">Domínio/Site</span>
                        <input
                          className="account-input"
                          value={accountCompany.domain}
                          onChange={(event) => setAccountCompany((c) => ({ ...c, domain: event.target.value }))}
                          placeholder="https://empresa.com.br"
                          type="url"
                        />
                      </label>
                      <label className="account-field account-field-span2">
                        <span className="account-label">Identificador da conta</span>
                        <div className="account-readonly">
                          {targetTenantId ? formatAccountIdForDisplay(targetTenantId) : "Nenhuma conta selecionada"}
                        </div>
                      </label>
                    </div>
                  </article>
                </div>

                <aside className="account-bento-aside">
                  <article className="account-card">
                    <div className="account-card-head">
                      <span className="material-symbols-outlined account-card-icon" aria-hidden="true">
                        security
                      </span>
                      <h2 className="account-card-title">Segurança e acesso</h2>
                    </div>
                    <div className="account-stack">
                      <label className="account-field">
                        <span className="account-label">URL de webhook atual</span>
                        <div
                          className="account-webhook-box"
                          title={webhookUrl?.trim() ? webhookUrl : undefined}
                        >
                          {webhookUrl || "Ainda não gerada"}
                        </div>
                      </label>
                      <div className="account-perms">
                        <span className="material-symbols-outlined account-perms-icon" aria-hidden="true">
                          verified_user
                        </span>
                        <span className="account-perms-text">
                          Permissões nesta conta:{" "}
                          {currentTenantMembershipRole
                            ? membershipRoleLabelPt(currentTenantMembershipRole)
                            : dashboardAuthGate && !accessToken?.trim()
                              ? "inicie sessão para ver seu papel."
                              : targetTenantId
                                ? "não identificadas (confira o identificador ou o vínculo do usuário)."
                                : "—"}
                        </span>
                      </div>
                      {isSupabaseBrowserConfigured && accessToken ? (
                        <div className="account-field account-field-span2" style={{ marginTop: "0.5rem" }}>
                          <button
                            type="button"
                            className="btn btn-tertiary"
                            onClick={() => void supabase?.auth.signOut()}
                          >
                            Terminar sessão do painel
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </article>

                  <article className="account-card">
                    <div className="account-card-head">
                      <span className="material-symbols-outlined account-card-icon" aria-hidden="true">
                        analytics
                      </span>
                      <h2 className="account-card-title">Uso atual</h2>
                    </div>
                    <div className="account-usage">
                      <div className="account-usage-block">
                        <div className="account-usage-row">
                          <span className="account-label">Eventos usados</span>
                          <span className="account-usage-fraction">
                            {formatUsageRatio(
                              data?.usage?.usage.events.used ?? 0,
                              data?.usage?.usage.events.limit ?? null,
                              data?.usage?.usage.events.unlimited ?? false,
                            )}
                          </span>
                        </div>
                        <div className="account-meter-track">
                          <div
                            className="account-meter-fill account-meter-fill--events"
                            style={{
                              width: `${Math.min((data?.usage?.usage.events.utilizationRate ?? 0) * 100, 100)}%`,
                            }}
                          />
                        </div>
                      </div>
                      <div className="account-usage-block">
                        <div className="account-usage-row">
                          <span className="account-label">Tentativas usadas</span>
                          <span className="account-usage-fraction">
                            {formatUsageRatio(
                              data?.usage?.usage.recoveryAttempts.used ?? 0,
                              data?.usage?.usage.recoveryAttempts.limit ?? null,
                              data?.usage?.usage.recoveryAttempts.unlimited ?? false,
                            )}
                          </span>
                        </div>
                        <div className="account-meter-track">
                          <div
                            className="account-meter-fill account-meter-fill--attempts"
                            style={{
                              width: `${Math.min((data?.usage?.usage.recoveryAttempts.utilizationRate ?? 0) * 100, 100)}%`,
                            }}
                          />
                        </div>
                      </div>
                      <div className="account-usage-total">
                        <span className="account-usage-total-label">Uso total do período</span>
                        <span className="account-usage-total-value">
                          {accountUsageCombinedPct != null ? `${accountUsageCombinedPct.toFixed(1)}%` : "—"}
                        </span>
                      </div>
                    </div>
                  </article>
                </aside>
              </div>
              <div className="account-page-spacer" aria-hidden="true" />
            </section>

            <footer className="account-actions-bar">
              <div className="account-actions-bar-left">
                <button
                  type="button"
                  className="account-btn account-btn-secondary"
                  onClick={() => void loadTenantDashboardSettings()}
                  disabled={settingsLoading}
                >
                  <span className="material-symbols-outlined" aria-hidden="true">
                    sync
                  </span>
                  {settingsLoading ? "Carregando..." : "Carregar dados da conta"}
                </button>
                <button
                  type="button"
                  className="account-btn account-btn-secondary"
                  disabled
                  title="Altere a URL apenas no menu Configurações."
                >
                  <span className="material-symbols-outlined" aria-hidden="true">
                    lock
                  </span>
                  Alteração só em Configurações
                </button>
                <button
                  type="button"
                  className="account-btn account-btn-secondary"
                  disabled={!webhookUrl}
                  onClick={() => {
                    if (!webhookUrl) {
                      pushToast("Gere uma URL de webhook antes de copiar.");
                      return;
                    }
                    void navigator.clipboard.writeText(webhookUrl);
                    pushToast("URL de webhook copiada.");
                  }}
                >
                  <span className="material-symbols-outlined" aria-hidden="true">
                    content_copy
                  </span>
                  Copiar URL
                </button>
              </div>
              <button
                type="button"
                className="account-btn account-btn-primary"
                onClick={() => void saveTenantDashboardSettings()}
                disabled={settingsSaving}
              >
                <span className="material-symbols-outlined account-btn-primary-icon" aria-hidden="true">
                  save
                </span>
                {settingsSaving ? "Salvando..." : "Salvar dados da conta"}
              </button>
            </footer>
          </>
        )}

        {isViewsModalOpen && (
          <div className="views-modal-backdrop" onClick={() => setIsViewsModalOpen(false)}>
            <section className="views-modal surface" onClick={(event) => event.stopPropagation()}>
              <div className="views-modal-head">
                <div>
                  <h3>Gerenciador de Filtros</h3>
                  <p>Renomeie, reordene com arrastar e solte, e defina o filtro padrão.</p>
                </div>
                <button className="btn btn-tertiary" onClick={() => setIsViewsModalOpen(false)}>
                  Fechar
                </button>
              </div>
              <div className="views-modal-toolbar">
                <input
                  className="search-input"
                  value={viewsSearch}
                  onChange={(event) => setViewsSearch(event.target.value)}
                  placeholder="Buscar filtros por nome, conta ou período"
                />
              </div>
              <div className="views-modal-list">
                {filteredViews.map((view) => (
                  <article
                    key={view.id}
                    className={`view-row ${draggingViewId === view.id ? "dragging" : ""}`}
                    draggable
                    onDragStart={() => setDraggingViewId(view.id)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => {
                      onMoveView(draggingViewId, view.id);
                      setDraggingViewId("");
                    }}
                    onDragEnd={() => setDraggingViewId("")}
                  >
                    <div className="view-drag">⋮⋮</div>
                    <input
                      className="view-inline-name"
                      defaultValue={view.name}
                      onBlur={(event) => onInlineRenameView(view.id, event.target.value)}
                    />
                    <div className="view-row-meta">
                      {view.isFavorite && <span className="pill pill-warning">Favorita</span>}
                      {defaultViewId === view.id && <span className="pill pill-neutral">Padrão</span>}
                    </div>
                    <div className="view-row-actions">
                      <button
                        className="btn btn-tertiary"
                        onClick={() => {
                          setSelectedViewId(view.id);
                          applyView(view);
                        }}
                      >
                        Aplicar
                      </button>
                      <button
                        className="btn btn-tertiary"
                        onClick={() => toggleFavoriteById(view.id)}
                      >
                        {view.isFavorite ? "Desfavoritar" : "Favoritar"}
                      </button>
                      <button className="btn btn-tertiary" onClick={() => setDefaultViewById(view.id)}>
                        Definir padrão
                      </button>
                      <button className="btn btn-tertiary" onClick={() => duplicateViewById(view.id)}>
                        Duplicar
                      </button>
                      <button
                        className="btn btn-tertiary"
                        onClick={() => requestDeleteView(view.id)}
                      >
                        Excluir
                      </button>
                    </div>
                  </article>
                ))}
                {!filteredViews.length && (
                  <article className="view-row empty-row">
                    <div className="view-drag">-</div>
                    <div>Nenhum filtro encontrado para a busca.</div>
                    <div />
                    <div />
                  </article>
                )}
              </div>
            </section>
          </div>
        )}

        {pendingDeleteView && (
          <div className="confirm-delete-backdrop" onClick={() => setPendingDeleteViewId("")}>
            <section className="confirm-delete-modal surface" onClick={(event) => event.stopPropagation()}>
              <h3>Confirmar exclusao</h3>
              <p>
                Tem certeza que deseja excluir o filtro <strong>{pendingDeleteView.name}</strong>?
                Você pode desfazer essa ação por alguns segundos após confirmar.
              </p>
              <div className="confirm-delete-actions">
                <button className="btn btn-tertiary" onClick={() => setPendingDeleteViewId("")}>
                  Cancelar
                </button>
                <button className="btn btn-danger" onClick={onConfirmDeleteView}>
                  Excluir filtro
                </button>
              </div>
            </section>
          </div>
        )}

        {webhookChangeDialogOpen && (
          <div className="confirm-delete-backdrop" onClick={() => !webhookChangeBusy && setWebhookChangeDialogOpen(false)}>
            <section className="confirm-delete-modal surface" onClick={(event) => event.stopPropagation()}>
              <h3>{webhookUrl ? "Alterar URL do webhook" : "Gerar URL do webhook"}</h3>
              <p>
                {webhookUrl
                  ? "Essa ação vai substituir a URL atual do webhook. Confirme com sua senha para continuar."
                  : "A URL do webhook será gerada e ficará bloqueada para mudanças comuns. Confirme com sua senha para continuar."}
              </p>
              <label className="auth-gate-field">
                <span className="auth-gate-label">Senha atual</span>
                <input
                  className="account-input"
                  type="password"
                  autoComplete="current-password"
                  value={webhookChangePassword}
                  onChange={(event) => setWebhookChangePassword(event.target.value)}
                  placeholder="Digite sua senha"
                  disabled={webhookChangeBusy}
                />
              </label>
              {webhookChangeError ? (
                <p className="auth-gate-error" role="alert">
                  {webhookChangeError}
                </p>
              ) : null}
              <div className="confirm-delete-actions">
                <button
                  className="btn btn-tertiary"
                  onClick={() => setWebhookChangeDialogOpen(false)}
                  disabled={webhookChangeBusy}
                >
                  Cancelar
                </button>
                <button className="btn btn-primary" onClick={() => void confirmWebhookUrlChange()} disabled={webhookChangeBusy}>
                  {webhookChangeBusy ? "Confirmando..." : "Confirmar alteração"}
                </button>
              </div>
            </section>
          </div>
        )}

        {toasts.length > 0 && (
          <div className="toast-stack" aria-live="polite">
            {toasts.map((toast) => (
              <div key={toast.id} className="toast-item">
                <span>{toast.text}</span>
                <div className="toast-actions">
                  {toast.actionLabel && toast.onAction && (
                    <button
                      className="toast-action-btn"
                      onClick={() => {
                        toast.onAction?.();
                        setToasts((current) => current.filter((item) => item.id !== toast.id));
                      }}
                    >
                      {toast.actionLabel}
                    </button>
                  )}
                  <button
                    className="toast-close"
                    onClick={() => setToasts((current) => current.filter((item) => item.id !== toast.id))}
                    aria-label="Fechar notificação"
                  >
                    ×
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
