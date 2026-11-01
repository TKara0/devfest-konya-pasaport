import { FieldValue, AggregateField } from 'firebase-admin/firestore';
import { db } from './firebase.js';
import { getConfig, roleOf } from './config.js';
import { ApiError, validateRegistration, displayName } from './validate.js';
import { CODE_RE, matchRotating, currentRotating } from './codes.js';

const SECRET = () => {
  const s = process.env.CODE_SECRET;
  if (!s || s.length < 16) throw new ApiError(500, 'NO_SECRET', 'Sunucu yapılandırması eksik (CODE_SECRET).');
  return s;
};

// Yanlış kod denemesi sınırı: 10 dk içinde 8 yanlış → 5 dk kilit
export const THROTTLE = { maxFails: 8, windowMs: 10 * 60_000, lockMs: 5 * 60_000 };

const slotKey = (slot) => String(slot).replace(/\D/g, '');

/* ------------------------------------------------------------------ */
/* Kullanıcı                                                           */
/* ------------------------------------------------------------------ */

function publicUser(id, u, extra = {}) {
  return {
    uid: id,
    username: u.username,
    firstName: u.firstName,
    lastName: u.lastName,
    email: u.email,
    phone: u.phone,
    tickets: u.tickets || 0,
    progress: u.progress || {},
    done: u.done || [],
    sessions: u.sessions || {},
    ...extra,
  };
}

export async function register(token, body) {
  const data = validateRegistration(body);
  const uid = token.uid;
  const userRef = db.doc(`users/${uid}`);
  const nameRef = db.doc(`usernames/${data.username}`);
  const phoneRef = db.doc(`phones/${data.phone}`);
  const now = Date.now();

  const user = {
    ...data,
    email: (token.email || '').toLowerCase(),
    tickets: 0,
    progress: {},
    done: [],
    sessions: {},
    createdAt: now,
    lastTicketAt: now,
  };

  await db.runTransaction(async (tx) => {
    const [u, n, p] = await Promise.all([tx.get(userRef), tx.get(nameRef), tx.get(phoneRef)]);
    if (u.exists) throw new ApiError(409, 'ALREADY_REGISTERED', 'Bu Google hesabıyla zaten bir pasaport var.');
    if (n.exists) throw new ApiError(409, 'USERNAME_TAKEN', 'Bu kullanıcı adı alınmış, başka bir tane dene.');
    if (p.exists) throw new ApiError(409, 'PHONE_TAKEN', 'Bu telefon numarasıyla zaten kayıt olunmuş. O hesabın Gmail adresiyle giriş yap.');
    tx.create(userRef, user);
    tx.create(nameRef, { uid });
    tx.create(phoneRef, { uid });
  });

  return publicUser(uid, user, { rank: null, role: await roleOf(user.email) });
}

export async function getMe(token) {
  const snap = await db.doc(`users/${token.uid}`).get();
  if (!snap.exists) throw new ApiError(404, 'NOT_REGISTERED', 'Henüz pasaportun yok. Kayıt formunu doldur.');
  const u = snap.data();
  const higher = await db.collection('users').where('tickets', '>', u.tickets || 0).count().get();
  return publicUser(snap.id, u, {
    rank: (u.tickets || 0) > 0 ? higher.data().count + 1 : null,
    role: await roleOf(token.email),
  });
}

/* ------------------------------------------------------------------ */
/* Kod kullanma                                                        */
/* ------------------------------------------------------------------ */

async function assertNotLocked(uid) {
  const snap = await db.doc(`throttle/${uid}`).get();
  const t = snap.exists ? snap.data() : null;
  if (t?.lockedUntil && t.lockedUntil > Date.now()) {
    const min = Math.ceil((t.lockedUntil - Date.now()) / 60_000);
    throw new ApiError(429, 'LOCKED', `Çok fazla yanlış kod denedin. ${min} dakika sonra tekrar dene.`);
  }
}

async function recordFail(uid) {
  const ref = db.doc(`throttle/${uid}`);
  return db.runTransaction(async (tx) => {
    const now = Date.now();
    const snap = await tx.get(ref);
    let t = snap.exists ? snap.data() : { fails: 0, windowStart: now, lockedUntil: 0 };
    if (now - t.windowStart > THROTTLE.windowMs) t = { fails: 0, windowStart: now, lockedUntil: 0 };
    t.fails += 1;
    if (t.fails >= THROTTLE.maxFails) t = { fails: 0, windowStart: now, lockedUntil: now + THROTTLE.lockMs };
    tx.set(ref, t);
    return t;
  });
}

/**
 * Kodun hangi göreve ait olduğunu bulur ve ilerlemeyi tek transaction'da işler.
 * @param uid    kodu kullanan katılımcı
 * @param code   6 haneli kod
 * @param via    'self' veya 'staff:<email>'
 */
export async function redeem(uid, rawCode, via = 'self') {
  const code = String(rawCode ?? '').replace(/\s/g, '');
  if (!CODE_RE.test(code)) throw new ApiError(400, 'INVALID_FORMAT', 'Kod 6 rakamdan oluşmalı.');

  await assertNotLocked(uid);
  const cfg = await getConfig();

  // 1) Sabit kod mu? (stant, oyun, atölye, oturum)
  let target = null;
  const codeSnap = await db.doc(`codes/${code}`).get();
  if (codeSnap.exists) target = codeSnap.data();

  // 2) Dönen (saatlik) kod mu?
  if (!target) {
    const m = matchRotating(SECRET(), cfg.tasks, code);
    if (m?.status === 'expired')
      throw new ApiError(410, 'EXPIRED', `Bu kodun süresi doldu. Görevliden ${m.task.name} için güncel kodu iste.`);
    if (m?.status === 'ok') target = { kind: 'step', taskId: m.task.id, stepId: m.task.id, label: m.task.name };
  }

  if (!target) {
    const t = await recordFail(uid);
    const left = THROTTLE.maxFails - t.fails;
    const hint = t.lockedUntil > Date.now() ? ' Çok fazla yanlış deneme yaptın, 5 dakika bekle.' : left <= 3 ? ` ${left} deneme hakkın kaldı.` : '';
    throw new ApiError(404, 'NOT_FOUND', `Bu kod tanınmadı. Rakamları kontrol edip tekrar dene.${hint}`);
  }

  const task = cfg.tasks.find((t) => t.id === target.taskId);
  if (!task) throw new ApiError(404, 'NOT_FOUND', 'Bu kodun görevi artık aktif değil.');
  const reward = Number(task.reward) || 1;
  const userRef = db.doc(`users/${uid}`);
  const now = Date.now();

  const result = await db.runTransaction(async (tx) => {
    const userSnap = await tx.get(userRef);
    if (!userSnap.exists) throw new ApiError(403, 'NOT_REGISTERED', 'Önce kayıt olman gerekiyor.');
    const u = userSnap.data();
    const update = {
      tickets: FieldValue.increment(reward),
      [`progress.${task.id}`]: FieldValue.increment(1),
      lastTicketAt: now,
    };

    if (target.kind === 'session') {
      const attRef = db.doc(`attendance/${uid}_${slotKey(target.slot)}`);
      const att = await tx.get(attRef);
      if (att.exists) {
        const a = att.data();
        if (a.sessionId === target.sessionId)
          throw new ApiError(409, 'ALREADY_USED', `“${target.label}” oturumuna zaten katıldın.`);
        throw new ApiError(409, 'SESSION_CONFLICT',
          `Aynı anda 2 oturuma katılamazsınız. ${target.slot} diliminde “${a.label}” oturumuna katılımın kayıtlı.`);
      }
      tx.create(attRef, { uid, sessionId: target.sessionId, slot: target.slot, label: target.label, at: now, via });
      update[`sessions.${slotKey(target.slot)}`] = target.sessionId;
    } else {
      const redRef = db.doc(`redemptions/${uid}_${target.stepId}`);
      const red = await tx.get(redRef);
      if (red.exists) {
        throw new ApiError(409, 'ALREADY_USED', task.type === 'rotating'
          ? `${task.name} görevini zaten tamamladın.`
          : `Bu kodu zaten kullandın (${target.label}).`);
      }
      tx.create(redRef, { uid, taskId: task.id, stepId: target.stepId, at: now, via });
      update.done = FieldValue.arrayUnion(target.stepId);
    }

    tx.update(userRef, update);

    // Güncel durumu istemciye geri dönmek için yerelde hesapla
    const next = { ...u, tickets: (u.tickets || 0) + reward, lastTicketAt: now };
    next.progress = { ...(u.progress || {}), [task.id]: ((u.progress || {})[task.id] || 0) + 1 };
    if (target.kind === 'session') next.sessions = { ...(u.sessions || {}), [slotKey(target.slot)]: target.sessionId };
    else next.done = [...new Set([...(u.done || []), target.stepId])];
    return next;
  });

  return {
    taskId: task.id,
    stepId: target.stepId || target.sessionId,
    reward,
    message: target.kind === 'session'
      ? `“${target.label}” katılımın kaydedildi. +${reward} çekiliş hakkı.`
      : `${target.label} onaylandı. +${reward} çekiliş hakkı.`,
    user: publicUser(uid, result),
  };
}

export async function staffRedeem(staffEmail, username, code) {
  const u = String(username ?? '').trim().toLowerCase().replace(/^@/, '');
  const snap = await db.doc(`usernames/${u}`).get();
  if (!snap.exists) throw new ApiError(404, 'USER_NOT_FOUND', `@${u} adında bir katılımcı yok.`);
  return redeem(snap.data().uid, code, `staff:${staffEmail}`);
}

/* ------------------------------------------------------------------ */
/* Sıralama                                                            */
/* ------------------------------------------------------------------ */

let boardCache = { at: 0, value: null };
const BOARD_TTL = 10_000;

export async function leaderboard() {
  if (boardCache.value && Date.now() - boardCache.at < BOARD_TTL) return boardCache.value;
  const [top, count] = await Promise.all([
    db.collection('users').orderBy('tickets', 'desc').orderBy('lastTicketAt', 'asc').limit(20).get(),
    db.collection('users').count().get(),
  ]);
  const rows = top.docs
    .map((d) => d.data())
    .filter((u) => (u.tickets || 0) > 0)
    .map((u, i) => ({ rank: i + 1, username: u.username, name: displayName(u), tickets: u.tickets }));
  boardCache = { at: Date.now(), value: { updatedAt: Date.now(), participants: count.data().count, top: rows } };
  return boardCache.value;
}

export function clearBoardCache() {
  boardCache = { at: 0, value: null };
}

/* ------------------------------------------------------------------ */
/* Görevli / yönetici                                                  */
/* ------------------------------------------------------------------ */

export async function staffCodes() {
  const cfg = await getConfig();
  return cfg.tasks.filter((t) => t.type === 'rotating').map((t) => currentRotating(SECRET(), t));
}

export async function stats() {
  const cfg = await getConfig();
  const aggs = { users: AggregateField.count(), tickets: AggregateField.sum('tickets') };
  for (const t of cfg.tasks) aggs[`t_${t.id}`] = AggregateField.sum(`progress.${t.id}`);
  const snap = await db.collection('users').aggregate(aggs).get();
  const d = snap.data();
  return {
    users: d.users,
    tickets: d.tickets || 0,
    tasks: cfg.tasks.map((t) => ({ id: t.id, name: t.name, completions: d[`t_${t.id}`] || 0 })),
  };
}

const csvCell = (v) => {
  const s = String(v ?? '');
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/**
 * Çekiliş uygulamasına uygun CSV. İlk dört sütun çekiliş uygulamasının
 * beklediği sırada: Zaman damgası, Ad Soyad, Telefon, E-posta.
 *  - mode=ozet   : kişi başı tek satır + görev bazında ilerleme
 *  - mode=hak    : her çekiliş hakkı için bir satır (ağırlıklı çekiliş)
 *  - mode=oturum : katıldığı her oturum için bir satır (oturum çekilişi)
 */
export async function exportCsv(mode = 'ozet') {
  const cfg = await getConfig();
  const snap = await db.collection('users').orderBy('tickets', 'desc').get();
  const users = snap.docs.map((d) => d.data());
  const stamp = (ms) => new Date(ms).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' });
  const base = (u) => [stamp(u.createdAt), `${u.firstName} ${u.lastName}`, u.phone, u.email];

  let header = ['Zaman damgası', 'Ad Soyad', 'Telefon', 'E-posta'];
  const lines = [];

  if (mode === 'hak') {
    header = [...header, 'Kullanıcı adı', 'Hak no'];
    for (const u of users) for (let i = 1; i <= (u.tickets || 0); i++) lines.push([...base(u), u.username, i]);
  } else if (mode === 'oturum') {
    const sessionTask = cfg.tasks.find((t) => t.type === 'session');
    const byId = Object.fromEntries(cfg.sessions.map((s) => [s.id, s]));
    header = [...header, 'Kullanıcı adı', 'Oturum'];
    for (const u of users) {
      for (const sid of Object.values(u.sessions || {})) lines.push([...base(u), u.username, byId[sid]?.title || sid]);
    }
    if (!sessionTask) lines.length = 0;
  } else {
    header = [...header, 'Kullanıcı adı', 'Çekiliş hakkı', ...cfg.tasks.map((t) => t.name)];
    for (const u of users) {
      lines.push([...base(u), u.username, u.tickets || 0, ...cfg.tasks.map((t) => (u.progress || {})[t.id] || 0)]);
    }
  }

  const body = [header, ...lines].map((r) => r.map(csvCell).join(',')).join('\r\n');
  return '﻿' + body; // BOM: Excel Türkçe karakterleri doğru açsın
}
