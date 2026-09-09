type StructuredEdgeError = { error?: unknown; message?: unknown }
const messages: Record<string, string> = {
  AUTHENTICATION_REQUIRED: 'Your session expired. Please sign in again.', API_FOOTBALL_NOT_CONFIGURED: 'Squad import is temporarily unavailable.', API_FOOTBALL_RATE_LIMIT: 'API-Football request limit reached. Try again later.', API_FOOTBALL_NOT_FOUND: 'No squad was found for this team.', UPSTREAM_AUTH_ERROR: 'Could not load the squad from API-Football.', UPSTREAM_ACCESS_DENIED: 'Could not load the squad from API-Football.', UPSTREAM_API_ERROR: 'Could not load the squad from API-Football.', UPSTREAM_NETWORK_ERROR: 'Could not reach API-Football. Check your connection and try again.', UPSTREAM_TIMEOUT: 'API-Football took too long to respond. Try again.', INVALID_UPSTREAM_JSON: 'Could not load the squad from API-Football.', INVALID_UPSTREAM_RESPONSE: 'Could not load the squad from API-Football.', NO_SQUAD_RETURNED: 'No squad was returned for this team.',
}
export async function squadImportErrorMessage(error: unknown): Promise<string> {
  const response = error && typeof error === 'object' ? (error as { context?: unknown }).context : undefined
  if (response instanceof Response) try {
    const body = await response.clone().json() as StructuredEdgeError
    if (typeof body.error === 'string' && messages[body.error]) return messages[body.error]
    if (typeof body.message === 'string' && body.message.length <= 160) return body.message
  } catch { /* The SDK error response may not have a JSON body. */ }
  return 'Could not load the squad. Check your connection and try again.'
}
