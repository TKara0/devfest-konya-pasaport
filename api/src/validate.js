export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const USERNAME_RE = /^[a-z0-9._]{3,20}$/;

/** 5xxxxxxxxx, 05xxxxxxxxx, 905xxxxxxxxx, +90 5xx ... → 05xxxxxxxxx */
export function normalizePhone(raw) {
  let d = String(raw ?? '').replace(/\D/g, '');
  if (d.startsWith('90') && d.length === 12) d = d.slice(2);
  if (d.length === 10) d = '0' + d;
  return /^05\d{9}$/.test(d) ? d : null;
}

function cleanName(raw) {
  const s = String(raw ?? '').replace(/\s+/g, ' ').trim();
  return s.length >= 1 && s.length <= 40 ? s : null;
}

export function validateRegistration(body) {
  const username = String(body?.username ?? '').trim().toLowerCase();
  const firstName = cleanName(body?.firstName);
  const lastName = cleanName(body?.lastName);
  const phone = normalizePhone(body?.phone);

  if (!USERNAME_RE.test(username))
    throw new ApiError(400, 'INVALID_USERNAME', 'Kullanıcı adı 3-20 karakter olmalı; küçük harf, rakam, nokta ve alt çizgi kullanabilirsin.');
  if (!firstName || !lastName) throw new ApiError(400, 'INVALID_NAME', 'Ad ve soyad gerekli (en fazla 40 karakter).');
  if (!phone) throw new ApiError(400, 'INVALID_PHONE', 'Telefonu 05xx xxx xx xx biçiminde yaz.');
  if (body?.kvkk !== true) throw new ApiError(400, 'KVKK_REQUIRED', 'Devam etmek için aydınlatma metnini onaylaman gerekiyor.');

  return { username, firstName, lastName, phone };
}

/** "Zeynep Ak" → "Zeynep A." — sıralamada tam soyad gösterilmez. */
export function displayName(u) {
  const initial = (u.lastName || '').trim().charAt(0);
  return initial ? `${u.firstName} ${initial.toLocaleUpperCase('tr-TR')}.` : u.firstName;
}
