/**
 * Local-only counterpart of the old session hook.
 *
 * Kept for call-site compatibility: the app has no accounts, so there is never a
 * signed-in user and the "loaded" state is immediate.
 */
export function useAuth() {
  return {
    isSignedIn: false,
    isGracePeriodOnly: false,
    isLoaded: true,
    session: null,
    user: null,
  };
}
