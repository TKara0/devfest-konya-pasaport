import { auth } from './firebase';
import type { Board, EventConfig, Me, RedeemResult, RotatingCode, Stats } from './types';

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const TIMEOUT_MS = 12_000;

async function request<T>(path: string, init: RequestInit & { authed?: boolean; raw?: boolean } = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body) headers.set('Content-Type', 'application/json');
  if (init.authed) {
    const user = auth.currentUser;
    if (!user) throw new ApiError(401, 'UNAUTHENTICATED', 'Oturumun kapanmış. Gmail ile tekrar giriş yap.');
    headers.set('Authorization', `Bearer ${await user.getIdToken()}`);
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`/api${path}`, { ...init, headers, signal: ctrl.signal });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Bağlantı kurulamadı. İnternetini kontrol edip tekrar dene.');
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    let code = 'HTTP_' + res.status;
    let message = 'Bir sorun oluştu. Birkaç saniye sonra tekrar dene.';
    try {
      const body = await res.json();
      code = body?.error?.code || code;
      message = body?.error?.message || message;
    } catch {
      /* JSON olmayan hata gövdesi: yerelde genelde API kapalı demektir */
      if (import.meta.env.DEV && res.status >= 500) {
        message = 'Yerel API’ye ulaşılamıyor. Kök klasörde `npm run demo` komutunu çalıştır.';
      }
    }
    throw new ApiError(res.status, code, message);
  }
  return (init.raw ? res.blob() : res.json()) as Promise<T>;
}

export const api = {
  config: () => request<EventConfig>('/config'),
  leaderboard: () => request<Board>('/leaderboard'),
  me: () => request<Me>('/me', { authed: true }),
  register: (body: { firstName: string; lastName: string; phone: string; kvkk: boolean }) =>
    request<Me>('/register', { method: 'POST', authed: true, body: JSON.stringify(body) }),
  redeem: (code: string) => request<RedeemResult>('/redeem', { method: 'POST', authed: true, body: JSON.stringify({ code }) }),
  staffCodes: () => request<RotatingCode[]>('/staff/codes', { authed: true }),
  staffRedeem: (email: string, code: string) =>
    request<RedeemResult>('/staff/redeem', { method: 'POST', authed: true, body: JSON.stringify({ email, code }) }),
  stats: () => request<Stats>('/admin/stats', { authed: true }),
  exportCsv: (mode: 'ozet' | 'hak' | 'oturum') => request<Blob>(`/admin/export?mode=${mode}`, { authed: true, raw: true }),
};
