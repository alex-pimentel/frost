/**
 * Local-only auth facade.
 *
 * Frost runs offline and has no accounts. This module keeps the small surface the
 * rest of the app still imports (`withSessionRefresh`, `signOut`, …) so call sites
 * keep working, but it never performs a network request and there is no session.
 *
 * If accounts ever come back, this is the single place to reimplement.
 */

export const AUTH_URL = "";
export const authClient = null;

export type SocialProvider = "google" | "microsoft" | "apple";

export function updateLastSignInTime(): void {}

export function isWithinGracePeriod(): boolean {
  return false;
}

export async function withSessionRefresh<T>(operation: () => Promise<T>): Promise<T> {
  return operation();
}

export async function signOut(): Promise<void> {}

export async function deleteAccount(): Promise<{ error?: Error }> {
  return { error: new Error("Accounts are not available in this local-only build") };
}

export async function signInWithSocial(_provider: SocialProvider): Promise<{ error?: Error }> {
  return { error: new Error("Accounts are not available in this local-only build") };
}

export async function signInWithSSO(_email: string): Promise<{ error?: Error }> {
  return { error: new Error("Accounts are not available in this local-only build") };
}

export async function requestPasswordReset(_email: string): Promise<{ error?: Error }> {
  return { error: new Error("Accounts are not available in this local-only build") };
}
