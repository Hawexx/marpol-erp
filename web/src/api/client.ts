const TOKEN_KEY = 'marpol.ppm.token';

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (token: string) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

export interface ApiErrorDetail {
  field: string;
  message: string;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: ApiErrorDetail[],
  ) {
    super(message);
  }
}

/** Oturum dustugunde uygulamayi giris ekranina dondurmek icin dinlenir. */
export const AUTH_EXPIRED_EVENT = 'marpol:auth-expired';

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = tokenStore.get();

  const res = await fetch(`/api${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });

  if (res.status === 401) {
    tokenStore.clear();
    window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT));
  }

  const text = await res.text();
  const body = text ? JSON.parse(text) : null;

  if (!res.ok) {
    throw new ApiError(
      res.status,
      body?.error ?? 'Beklenmeyen bir hata olustu.',
      body?.details,
    );
  }

  return body as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(data ?? {}) }),
  put: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(data ?? {}) }),
  patch: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(data ?? {}) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

/** Hata nesnesinden kullaniciya gosterilecek mesaji cikarir. */
export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.details?.length) {
      return `${err.message} (${err.details.map((d) => d.message).join(' ')})`;
    }
    return err.message;
  }
  if (err instanceof Error) return err.message;
  return 'Bilinmeyen bir hata olustu.';
}
