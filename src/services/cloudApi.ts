/**
 * Cloud API is disabled.
 *
 * Frost is local-only: nothing in the app may talk to the former backend. This
 * module keeps the original signatures so existing call sites still compile and
 * their local fallbacks run, but every call fails fast *before* any network I/O.
 */

export class CloudApiError extends Error {
  status: number;
  constructor(message: string, status = 0) {
    super(message);
    this.name = "CloudApiError";
    this.status = status;
  }
}

function unavailable(): never {
  throw new CloudApiError("Cloud features are disabled in this local-only build", 503);
}

export async function cloudGet<T = unknown>(_path: string): Promise<T> {
  unavailable();
}

export async function cloudPost<T = unknown>(_path: string, _body?: unknown): Promise<T> {
  unavailable();
}

export async function cloudPatch<T = unknown>(_path: string, _body?: unknown): Promise<T> {
  unavailable();
}

export async function cloudDelete(_path: string): Promise<void> {
  unavailable();
}
