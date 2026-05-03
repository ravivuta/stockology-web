/**
 * Pass-through to Google’s authorize URL so the account picker always shows.
 * Without this, a signed-in Google session in the browser skips the chooser and
 * reuses the previous account right after app sign-out.
 */
export function googleOAuthSignInOptions(origin: string, nextPath?: string) {
  const redirect = new URL("/auth/callback", origin);
  if (nextPath) redirect.searchParams.set("next", nextPath);
  return {
    redirectTo: redirect.toString(),
    queryParams: { prompt: "select_account" },
  };
}
