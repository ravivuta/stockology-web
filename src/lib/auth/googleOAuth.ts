/**
 * Pass-through to Google’s authorize URL so the account picker always shows.
 * Without this, a signed-in Google session in the browser skips the chooser and
 * reuses the previous account right after app sign-out.
 */
export function googleOAuthSignInOptions(origin: string) {
  return {
    redirectTo: `${origin}/auth/callback`,
    queryParams: { prompt: "select_account" },
  };
}
