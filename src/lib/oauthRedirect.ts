/** Builds a callback URL without losing a GitHub Pages repository base path. */
export function oauthRedirectUrl(origin: string, baseUrl: string): string {
  return new URL(baseUrl, origin).toString()
}
