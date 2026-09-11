export type SquadImportErrorCode = 'AUTHENTICATION_REQUIRED' | 'API_FOOTBALL_NOT_CONFIGURED' | 'API_FOOTBALL_RATE_LIMIT' | 'API_FOOTBALL_NOT_FOUND' | 'UPSTREAM_AUTH_ERROR' | 'UPSTREAM_ACCESS_DENIED' | 'UPSTREAM_API_ERROR' | 'UPSTREAM_NETWORK_ERROR' | 'UPSTREAM_TIMEOUT' | 'INVALID_UPSTREAM_JSON' | 'INVALID_UPSTREAM_RESPONSE' | 'NO_SQUAD_RETURNED'
type StructuredEdgeError = { error?: unknown; message?: unknown }
const messages: Record<SquadImportErrorCode, string> = {
  AUTHENTICATION_REQUIRED: 'Your session expired. Please sign in again.',
  API_FOOTBALL_NOT_CONFIGURED: 'Squad import is unavailable: API-Football is not configured on the server.',
  API_FOOTBALL_RATE_LIMIT: 'API-Football request limit reached. Try again later.',
  API_FOOTBALL_NOT_FOUND: 'No squad was found for this team.',
  UPSTREAM_AUTH_ERROR: 'API-Football rejected the server credentials. Please contact the app administrator.',
  UPSTREAM_ACCESS_DENIED: 'API-Football access was denied. Check the server subscription or permissions.',
  UPSTREAM_API_ERROR: 'API-Football is temporarily unavailable. Please try again shortly.',
  UPSTREAM_NETWORK_ERROR: 'Could not reach API-Football. Check your connection and try again.',
  UPSTREAM_TIMEOUT: 'API-Football took too long to respond. Try again.',
  INVALID_UPSTREAM_JSON: 'API-Football returned unreadable squad data. Please try again later.',
  INVALID_UPSTREAM_RESPONSE: 'API-Football returned an unexpected squad response. Please try again later.',
  NO_SQUAD_RETURNED: 'No squad was returned for this team.',
}

export async function squadImportErrorCode(error: unknown): Promise<SquadImportErrorCode | undefined> {
  const response = error && typeof error === 'object' ? (error as { context?: unknown }).context : undefined
  if (!(response instanceof Response)) return undefined
  try {
    const body = await response.clone().json() as StructuredEdgeError
    return typeof body.error === 'string' && body.error in messages ? body.error as SquadImportErrorCode : undefined
  } catch { return undefined }
}
export async function squadImportErrorMessage(error: unknown): Promise<string> {
  const response = error && typeof error === 'object' ? (error as { context?: unknown }).context : undefined
  if (response instanceof Response) try {
    const body = await response.clone().json() as StructuredEdgeError
    if (typeof body.error === 'string' && body.error in messages) return messages[body.error as SquadImportErrorCode]
    if (typeof body.message === 'string' && body.message.length <= 160) return body.message
  } catch { /* The SDK error response may not have a JSON body. */ }
  return 'Could not load the squad. Check your connection and try again.'
}
