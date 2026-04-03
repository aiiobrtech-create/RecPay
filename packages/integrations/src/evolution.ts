export interface SendEvolutionMessageInput {
  to: string;
  text: string;
  requestId: string;
}

export interface SendEvolutionMessageResult {
  ok: boolean;
  statusCode?: number;
  providerMessageId?: string;
  errorCode?: string;
  errorMessage?: string;
  errorType?: "transient" | "permanent";
}

function baseUrl(): string | null {
  const raw = process.env.EVOLUTION_API_BASE_URL?.trim();
  if (!raw) return null;
  return raw.replace(/\/+$/, "");
}

function instanceName(): string | null {
  const raw = process.env.EVOLUTION_INSTANCE?.trim();
  if (!raw) return null;
  return raw;
}

function apiKey(): string | null {
  const raw = process.env.EVOLUTION_API_KEY?.trim();
  if (!raw) return null;
  return raw;
}

function timeoutMs(): number {
  const raw = process.env.EVOLUTION_SEND_TIMEOUT_MS?.trim();
  const n = raw ? Number.parseInt(raw, 10) : 8_000;
  return Number.isFinite(n) && n > 0 ? Math.min(n, 30_000) : 8_000;
}

function sanitizePhone(value: string): string {
  return value.replace(/[^\d]/g, "");
}

export async function sendEvolutionMessage(
  input: SendEvolutionMessageInput,
): Promise<SendEvolutionMessageResult> {
  const urlBase = baseUrl();
  const instance = instanceName();
  const key = apiKey();

  if (!urlBase || !instance || !key) {
    return {
      ok: false,
      errorCode: "evolution_not_configured",
      errorMessage: "EVOLUTION_API_BASE_URL, EVOLUTION_INSTANCE ou EVOLUTION_API_KEY ausente.",
      errorType: "permanent",
    };
  }

  const to = sanitizePhone(input.to);
  if (!to) {
    return {
      ok: false,
      errorCode: "invalid_phone",
      errorMessage: "Número de destino inválido.",
      errorType: "permanent",
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs());

  try {
    const response = await fetch(`${urlBase}/message/sendText/${encodeURIComponent(instance)}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        apikey: key,
      },
      body: JSON.stringify({
        number: to,
        text: input.text,
      }),
      signal: controller.signal,
    });

    const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;

    if (!response.ok) {
      return {
        ok: false,
        statusCode: response.status,
        errorCode: "provider_http_error",
        errorMessage:
          (payload?.message as string | undefined) ??
          `Evolution API retornou ${response.status}.`,
        errorType: response.status >= 500 ? "transient" : "permanent",
      };
    }

    return {
      ok: true,
      statusCode: response.status,
      providerMessageId:
        (payload?.key as string | undefined) ??
        (payload?.id as string | undefined) ??
        undefined,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "unknown_error";
    return {
      ok: false,
      errorCode: msg.includes("aborted") ? "timeout" : "network_error",
      errorMessage: msg,
      errorType: "transient",
    };
  } finally {
    clearTimeout(timer);
  }
}
