export function dashboardAuthHeaders(accessToken: string | null): Record<string, string> {
  const headers: Record<string, string> = { accept: "application/json" };
  if (accessToken?.trim()) {
    headers.authorization = `Bearer ${accessToken.trim()}`;
  }
  return headers;
}

/**
 * Parse JSON da resposta sem falhar com corpo vazio (204, proxies, erros HTML).
 * Consome o corpo da resposta uma única vez.
 */
export async function readResponseJson<T = unknown>(response: Response): Promise<T | null> {
  const text = await response.text();
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    return null;
  }
}

export function dashboardFetch(
  input: string,
  accessToken: string | null,
  init: RequestInit = {},
): Promise<Response> {
  const baseHeaders = dashboardAuthHeaders(accessToken);
  const extra = init.headers;
  const merged: Record<string, string> = { ...baseHeaders };
  if (extra && typeof extra === "object" && !Array.isArray(extra)) {
    for (const [k, v] of Object.entries(extra as Record<string, string>)) {
      if (typeof v === "string") merged[k] = v;
    }
  }
  return fetch(input, { ...init, headers: merged });
}
