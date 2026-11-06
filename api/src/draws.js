import { randomBytes } from 'node:crypto';
import { db } from './firebase.js';
import { getConfig } from './config.js';
import { ApiError } from './validate.js';
import { csvCell } from './service.js';
import { LIMITS, RESULT, KIND, DRAW, weightFor, pickWeighted, leavesPool } from './raffle.js';

/* ------------------------------------------------------------------ */
/* Kilit: aynı anda tek çekiliş / sonuç değişikliği                    */
/* ------------------------------------------------------------------ */

const LOCK_PATH = 'locks/draw';
const LOCK_TTL = 60_000; // takılı kalmış bir kilit en geç 1 dk sonra düşer

/** Kilit belgesi transaction içinde alınır; iş bitince (hata olsa da) bırakılır. */
async function withLock(fn) {
  const ref = db.doc(LOCK_PATH);
  const token = randomBytes(8).toString('hex');
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists && Date.now() - snap.data().at < LOCK_TTL)
      throw new ApiError(409, 'DRAW_BUSY', 'Şu an başka bir çekiliş işlemi sürüyor. Birkaç saniye sonra tekrar dene.');
    tx.set(ref, { token, at: Date.now() });
  });
  try {
    return await fn();
  } finally {
    await db
      .runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (snap.exists && snap.data().token === token) tx.delete(ref);
      })
      .catch(() => undefined);
  }
}

/* ------------------------------------------------------------------ */
/* Havuz                                                               */
/* ------------------------------------------------------------------ */

function raffleOf(cfg, id) {
  const raffle = cfg.raffles.find((r) => r.id === id);
  if (!raffle) throw new ApiError(404, 'RAFFLE_NOT_FOUND', 'Böyle bir çekiliş kategorisi yok.');
  return raffle;
}

/** Havuzu belirleyen veriler: kullanıcılar, çekilişlerde yer alıp havuzdan çıkanlar, görevli/yönetici Gmail'leri. */
async function loadContext() {
  const [users, draws, roles] = await Promise.all([
    db.collection('users').get(),
    db.collection('draws').where('status', '==', DRAW.active).get(),
    db.collection('roles').get(),
  ]);
  const blocked = new Set();
  for (const d of draws.docs) for (const r of d.data().results || []) if (leavesPool(r)) blocked.add(r.uid);
  return { users: users.docs, blocked, staff: new Set(roles.docs.map((d) => d.id.toLowerCase())) };
}

/** Şansı > 0 olan, havuzdan çıkmamış kayıtlı katılımcılar. */
function poolOf(raffle, ctx, cfg) {
  const pool = [];
  for (const d of ctx.users) {
    const u = d.data();
    if (ctx.blocked.has(d.id) || ctx.staff.has(String(u.email || '').toLowerCase())) continue;
    const weight = weightFor(u, raffle, cfg);
    if (weight > 0) {
      pool.push({ uid: d.id, firstName: u.firstName, lastName: u.lastName, email: u.email, phone: u.phone || null, weight });
    }
  }
  return pool;
}

/** Kategoriler + her biri için anlık havuz büyüklüğü ve toplam şans. */
export async function listRaffles() {
  const cfg = await getConfig();
  const ctx = await loadContext();
  return cfg.raffles.map((r) => {
    const pool = poolOf(r, ctx, cfg);
    return { id: r.id, name: r.name, tasks: r.tasks, weight: r.weight, poolSize: pool.length, totalWeight: pool.reduce((s, p) => s + p.weight, 0) };
  });
}

/** Sahnedeki dönen isim animasyonu için yalnızca "ad soyad". Telefon/e-posta yok. */
export async function raffleNames(raffleId) {
  const cfg = await getConfig();
  const raffle = raffleOf(cfg, raffleId);
  return poolOf(raffle, await loadContext(), cfg).map((p) => `${p.firstName} ${p.lastName}`);
}

/* ------------------------------------------------------------------ */
/* Çekiliş                                                             */
/* ------------------------------------------------------------------ */

const newDrawId = () => Date.now().toString(36) + randomBytes(3).toString('hex'); // zamana göre sıralanabilir

function count(raw, { min, max }, label) {
  const n = raw === undefined || raw === null || raw === '' ? (min === 0 ? 0 : NaN) : Number(raw);
  if (!Number.isInteger(n) || n < min || n > max)
    throw new ApiError(400, 'INVALID_COUNT', `${label} sayısı ${min} ile ${max} arasında bir tam sayı olmalı.`);
  return n;
}

const winRecord = (draw, status) => ({ raffleId: draw.raffleId, raffleName: draw.raffleName, prize: draw.prize, status });

export async function createDraw(adminEmail, body) {
  const winners = count(body?.winners, LIMITS.winners, 'Kazanan');
  const backups = count(body?.backups, LIMITS.backups, 'Yedek');
  const prize = String(body?.prize ?? '').replace(/\s+/g, ' ').trim();
  if (prize.length > 120) throw new ApiError(400, 'INVALID_PRIZE', 'Ödül adı en fazla 120 karakter olabilir.');

  const cfg = await getConfig();
  const raffle = raffleOf(cfg, String(body?.raffleId ?? ''));

  return withLock(async () => {
    const ctx = await loadContext();
    const pool = poolOf(raffle, ctx, cfg);
    if (!pool.length) throw new ApiError(409, 'EMPTY_POOL', 'Bu kategoride havuzda çekilecek kimse yok.');

    // Önce kazananlar, sonra yedekler: tek seferde iadesiz çekilir, ilk winnersDrawn kişi kazanan
    const winnersDrawn = Math.min(winners, pool.length);
    const backupsDrawn = Math.min(backups, pool.length - winnersDrawn);
    const picked = pickWeighted(pool, winnersDrawn + backupsDrawn);
    const results = picked.map((p, i) => {
      const isWinner = i < winnersDrawn;
      return {
        uid: p.uid, firstName: p.firstName, lastName: p.lastName, email: p.email, phone: p.phone, weight: p.weight,
        kind: isWinner ? KIND.winner : KIND.backup,
        order: isWinner ? i + 1 : i - winnersDrawn + 1,
        status: RESULT.waiting,
      };
    });

    const id = newDrawId();
    const draw = {
      raffleId: raffle.id, raffleName: raffle.name, prize,
      winnersWanted: winners, backupsWanted: backups, winnersDrawn, backupsDrawn,
      poolSize: pool.length, totalWeight: pool.reduce((s, p) => s + p.weight, 0),
      drawnBy: adminEmail, drawnAt: Date.now(),
      status: DRAW.active, cancelledBy: null, cancelledAt: null,
      results,
    };

    await db.runTransaction(async (tx) => {
      tx.create(db.doc(`draws/${id}`), draw);
      for (const r of results) {
        if (r.kind === KIND.winner) tx.update(db.doc(`users/${r.uid}`), { [`wins.${id}`]: winRecord(draw, RESULT.waiting) });
      }
    });

    const short = winnersDrawn < winners || backupsDrawn < backups;
    return {
      id, ...draw, short,
      message: short
        ? `Havuzda yalnızca ${pool.length} kişi vardı: ${winnersDrawn} kazanan, ${backupsDrawn} yedek çekilebildi (istenen: ${winners} kazanan, ${backups} yedek).`
        : null,
    };
  });
}

export async function listDraws() {
  const snap = await db.collection('draws').orderBy('drawnAt', 'desc').get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function loadDraw(tx, id) {
  const ref = db.doc(`draws/${id}`);
  const snap = await tx.get(ref);
  if (!snap.exists) throw new ApiError(404, 'DRAW_NOT_FOUND', 'Böyle bir çekiliş kaydı yok.');
  const draw = snap.data();
  if (draw.status === DRAW.cancelled) throw new ApiError(409, 'DRAW_CANCELLED', 'Bu çekiliş iptal edilmiş.');
  return { ref, draw };
}

/**
 * Kazananı "teslim edildi" ya da "gelmedi" işaretler.
 * "gelmedi" → sıradaki bekleyen yedek "yedekten kazanana geçti" olur (yedek yoksa söylenir, yeni çekim yapılmaz).
 * Yalnızca bekleyen sonuç değiştirilebilir (kazanan: bekliyor, yedek: yedekten kazanana geçti); geri alma yok.
 */
export async function setResultStatus(id, rawIndex, status) {
  if (status !== RESULT.delivered && status !== RESULT.noShow)
    throw new ApiError(400, 'INVALID_STATUS', `Durum “${RESULT.delivered}” ya da “${RESULT.noShow}” olmalı.`);
  const index = Number(rawIndex);

  return withLock(() =>
    db.runTransaction(async (tx) => {
      const { ref, draw } = await loadDraw(tx, id);
      const results = draw.results;
      const row = Number.isInteger(index) ? results[index] : undefined;
      if (!row) throw new ApiError(404, 'RESULT_NOT_FOUND', 'Böyle bir sonuç satırı yok.');
      if (row.status === status) return { id, ...draw, promoted: null, message: null }; // aynı işaret tekrarı: değişiklik yok

      const pending = row.kind === KIND.winner ? RESULT.waiting : RESULT.promoted;
      if (row.kind === KIND.backup && row.status === RESULT.waiting)
        throw new ApiError(409, 'NOT_WINNER', 'Bu kişi henüz yedekten kazanana geçmedi.');
      if (row.status !== pending) throw new ApiError(409, 'ALREADY_SET', `Bu sonuç zaten “${row.status}” olarak işaretlenmiş, değiştirilemez.`);

      const userUpdates = {};
      row.status = status;
      userUpdates[row.uid] = status;

      let promoted = null;
      let message = null;
      if (status === RESULT.noShow) {
        const next = results.find((r) => r.kind === KIND.backup && r.status === RESULT.waiting);
        if (next) {
          next.status = RESULT.promoted;
          userUpdates[next.uid] = RESULT.waiting; // katılımcıya yedeklik gösterilmez: normal kazanan gibi "bekliyor"
          promoted = { index: results.indexOf(next), firstName: next.firstName, lastName: next.lastName, order: next.order };
          message = `${row.firstName} ${row.lastName} elendi. Sıradaki yedek ${next.firstName} ${next.lastName} kazanana geçti.`;
        } else {
          message = `${row.firstName} ${row.lastName} elendi ama sırada bekleyen yedek kalmadı. Gerekirse yeni bir çekiliş yap.`;
        }
      }

      tx.update(ref, { results });
      for (const [uid, st] of Object.entries(userUpdates)) {
        tx.update(db.doc(`users/${uid}`), { [`wins.${id}`]: winRecord(draw, st) });
      }
      return { id, ...draw, promoted, message };
    }),
  );
}

/** Çekilişi iptal eder (kayıt silinmez); kazananlar havuza geri döner, pasaporttan "Kazandın" kalkar. */
export async function cancelDraw(adminEmail, id) {
  return withLock(() =>
    db.runTransaction(async (tx) => {
      const { ref, draw } = await loadDraw(tx, id);
      const update = { status: DRAW.cancelled, cancelledBy: adminEmail, cancelledAt: Date.now() };
      tx.update(ref, update);
      for (const r of draw.results) {
        if (r.kind === KIND.winner || r.status !== RESULT.waiting) {
          tx.update(db.doc(`users/${r.uid}`), { [`wins.${id}`]: winRecord(draw, DRAW.cancelled) });
        }
      }
      return { id, ...draw, ...update };
    }),
  );
}

/* ------------------------------------------------------------------ */
/* CSV                                                                 */
/* ------------------------------------------------------------------ */

/** Tüm çekilişlerin sonuçları (iptal edilenler durumu "iptal edildi" olarak). BOM'lu UTF-8. */
export async function exportDraws() {
  const draws = (await listDraws()).reverse(); // eskiden yeniye: Çekiliş 1, 2, ...
  const stamp = (ms) => new Date(ms).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' });
  const header = ['Çekiliş', 'Kategori', 'Ödül', 'Tür', 'Sıra', 'Durum', 'Ad Soyad', 'Telefon', 'E-posta', 'Zaman'];
  const lines = [];
  draws.forEach((d, i) => {
    const rows = [...d.results].sort((a, b) => (a.kind === b.kind ? a.order - b.order : a.kind === KIND.winner ? -1 : 1));
    for (const r of rows) {
      lines.push([
        i + 1, d.raffleName, d.prize, r.kind, r.order,
        d.status === DRAW.cancelled ? DRAW.cancelled : r.status,
        `${r.firstName} ${r.lastName}`, r.phone || '', r.email, stamp(d.drawnAt),
      ]);
    }
  });
  return '﻿' + [header, ...lines].map((r) => r.map(csvCell).join(',')).join('\r\n');
}
