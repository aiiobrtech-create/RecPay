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

function normalizeBrazilianPhone(value: string): string {
  const digits = sanitizePhone(value);
  if (!digits) return "";
  if (digits.startsWith("55") && digits.length >= 12) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

type EvolutionResponseBody = Record<string, unknown> | null;

function safeTrimMessage(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function extractErrorMessage(body: EvolutionResponseBody, fallback: string): string {
  if (!body) return fallback;
  return (
    safeTrimMessage(body.message) ??
    safeTrimMessage(body.error) ??
    safeTrimMessage(body.details) ??
    safeTrimMessage(body.response) ??
    safeTrimMessage(body.description) ??
    fallback
  );
}

function buildSendTextPayload(input: SendEvolutionMessageInput, legacy: boolean): Record<string, unknown> {
  if (legacy) {
    return {
      number: input.to,
      textMessage: {
        text: input.text,
      },
    };
  }

  return {
    number: input.to,
    text: input.text,
  };
}

async function sendEvolutionTextRequest(
  urlBase: string,
  instance: string,
  key: string,
  payload: Record<string, unknown>,
  signal: AbortSignal,
): Promise<{ response: Response; body: EvolutionResponseBody }> {
  const response = await fetch(`${urlBase}/message/sendText/${encodeURIComponent(instance)}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: key,
    },
    body: JSON.stringify(payload),
    signal,
  });

  const rawBody = await response.text();
  let body: EvolutionResponseBody = null;
  if (rawBody.trim()) {
    try {
      body = JSON.parse(rawBody) as Record<string, unknown>;
    } catch {
      body = null;
    }
  }

  return { response, body };
}

function shouldTryLegacyPayload(statusCode: number): boolean {
  return statusCode === 400 || statusCode === 415 || statusCode === 422;
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

  const to = normalizeBrazilianPhone(input.to);
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
    const firstAttempt = await sendEvolutionTextRequest(
      urlBase,
      instance,
      key,
      buildSendTextPayload({ ...input, to }, false),
      controller.signal,
    );

    if (firstAttempt.response.ok) {
      return {
        ok: true,
        statusCode: firstAttempt.response.status,
        providerMessageId:
          (firstAttempt.body?.key as string | undefined) ??
          (firstAttempt.body?.id as string | undefined) ??
          undefined,
      };
    }

    if (shouldTryLegacyPayload(firstAttempt.response.status)) {
      const secondAttempt = await sendEvolutionTextRequest(
        urlBase,
        instance,
        key,
        buildSendTextPayload({ ...input, to }, true),
        controller.signal,
      );

      if (secondAttempt.response.ok) {
        return {
          ok: true,
          statusCode: secondAttempt.response.status,
          providerMessageId:
            (secondAttempt.body?.key as string | undefined) ??
            (secondAttempt.body?.id as string | undefined) ??
            undefined,
        };
      }

      return {
        ok: false,
        statusCode: secondAttempt.response.status,
        errorCode: "provider_http_error",
        errorMessage: extractErrorMessage(
          secondAttempt.body,
          `Evolution API retornou ${secondAttempt.response.status}.`,
        ),
        errorType: secondAttempt.response.status >= 500 ? "transient" : "permanent",
      };
    }

    return {
      ok: false,
      statusCode: firstAttempt.response.status,
      errorCode: "provider_http_error",
      errorMessage: extractErrorMessage(firstAttempt.body, `Evolution API retornou ${firstAttempt.response.status}.`),
      errorType: firstAttempt.response.status >= 500 ? "transient" : "permanent",
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
