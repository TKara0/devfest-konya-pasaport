export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/**
 * Kimlik kişisel Gmail adresidir. Öğrenci/kurum (Google Workspace) hesapları kabul edilmez.
 * Gerekirse ALLOWED_EMAIL_DOMAINS ortam değişkeniyle değiştirilebilir.
 */
const ALLOWED_DOMAINS = (process.env.ALLOWED_EMAIL_DOMAINS || 'gmail.com,googlemail.com')
  .split(',')
  .map((d) => d.trim().toLowerCase())
  .filter(Boolean);

export function isAllowedEmail(email) {
  const domain = String(email || '').toLowerCase().split('@')[1];
  return !!domain && ALLOWED_DOMAINS.includes(domain);
}

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

/** Kayıt: ad ve soyad zorunlu, telefon isteğe bağlı. Gmail adresi Google girişinden gelir. */
export function validateRegistration(body) {
  const firstName = cleanName(body?.firstName);
  const lastName = cleanName(body?.lastName);
  const rawPhone = String(body?.phone ?? '').trim();
  const phone = rawPhone ? normalizePhone(rawPhone) : null;

  if (!firstName || !lastName) throw new ApiError(400, 'INVALID_NAME', 'Ad ve soyad gerekli (en fazla 40 karakter).');
  if (rawPhone && !phone) throw new ApiError(400, 'INVALID_PHONE', 'Telefonu 05xx xxx xx xx biçiminde yaz ya da boş bırak.');
  if (body?.kvkk !== true) throw new ApiError(400, 'KVKK_REQUIRED', 'Devam etmek için aydınlatma metnini onaylaman gerekiyor.');

  return { firstName, lastName, phone };
}

/** "Zeynep Ak" → "Zeynep A." — sıralamada tam soyad gösterilmez. */
export function displayName(u) {
  const initial = (u.lastName || '').trim().charAt(0);
  return initial ? `${u.firstName} ${initial.toLocaleUpperCase('tr-TR')}.` : u.firstName;
}
