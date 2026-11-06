import { randomInt } from 'node:crypto';

/**
 * Çekiliş kuralları (saf fonksiyonlar, veritabanı yok): şans hesabı, ağırlıklı seçim,
 * kategori doğrulaması. Firestore işleri draws.js içindedir.
 */

export const WEIGHTS = ['tickets', 'count'];
export const LIMITS = { winners: { min: 1, max: 50 }, backups: { min: 0, max: 50 } };

/** Sonuç satırı durumları (draws/{id}.results[].status). */
export const RESULT = { waiting: 'bekliyor', delivered: 'teslim edildi', noShow: 'gelmedi', promoted: 'yedekten kazanana geçti' };
export const KIND = { winner: 'kazanan', backup: 'yedek' };
export const DRAW = { active: 'aktif', cancelled: 'iptal edildi' };

/**
 * event.json "raffles" dizisini doğrular. Hata varsa Türkçe mesajlı Error fırlatır.
 * @param raffles  [{ id, name, tasks: [görev id], weight: 'tickets'|'count' }]
 * @param tasks    event.json görevleri (bilinmeyen görev id'si hata sayılır)
 */
export function validateRaffles(raffles, tasks) {
  if (raffles === undefined) return [];
  if (!Array.isArray(raffles)) throw new Error('raffles bir dizi olmalı.');
  const taskIds = new Set((tasks || []).map((t) => t.id));
  const seen = new Set();
  for (const r of raffles) {
    if (!r?.id || !/^[a-z0-9-]+$/.test(r.id)) throw new Error(`Geçersiz çekiliş id: ${r?.id}`);
    if (seen.has(r.id)) throw new Error(`Tekrarlanan çekiliş id: ${r.id}`);
    seen.add(r.id);
    if (typeof r.name !== 'string' || !r.name.trim()) throw new Error(`${r.id}: name boş olamaz`);
    if (!WEIGHTS.includes(r.weight)) throw new Error(`${r.id}: weight ${WEIGHTS.join('/')} olmalı`);
    if (!Array.isArray(r.tasks) || !r.tasks.length) throw new Error(`${r.id}: tasks en az bir görev id'si içermeli`);
    for (const t of r.tasks) {
      if (!taskIds.has(t)) throw new Error(`${r.id}: bilinmeyen görev id'si “${t}”`);
    }
    if (new Set(r.tasks).size !== r.tasks.length) throw new Error(`${r.id}: tasks içinde tekrarlanan görev var`);
  }
  return raffles;
}

// Kademeli hak kuralı (docs/ACIK-KARARLAR.md) kesinleşince yalnızca burası değişir.
/**
 * Bir kişinin bir çekiliş kategorisindeki şansı.
 *  - "tickets": listedeki görevlerin progress[görev] × reward toplamı
 *  - "count"  : listedeki görevlerin progress[görev] toplamı
 */
export function weightFor(user, raffle, config) {
  const progress = user.progress || {};
  let total = 0;
  for (const id of raffle.tasks) {
    const n = Number(progress[id]) || 0;
    if (raffle.weight === 'tickets') {
      const task = (config.tasks || []).find((t) => t.id === id);
      total += n * (Number(task?.reward) || 1); // redeem() ile aynı varsayılan
    } else {
      total += n;
    }
  }
  return total;
}

/** [0, 1) aralığında kriptografik rastgele sayı. */
export const randomUnit = () => randomInt(0, 2 ** 40) / 2 ** 40;

/**
 * Ağırlıklı, iadesiz seçim: her turda kalanlar arasından ağırlığı oranında biri seçilir
 * ve çıkarılır (aynı kişi iki kez çıkmaz). Sonuç çekiliş sırasındadır.
 * @param items  [{ weight, ... }]  (weight <= 0 olanlar hiç seçilmez)
 * @param rng    () => [0,1); varsayılan crypto, testlerde sabit tohumlu verilebilir
 */
export function pickWeighted(items, count, rng = randomUnit) {
  const left = items.filter((x) => x.weight > 0);
  const out = [];
  while (out.length < count && left.length) {
    const total = left.reduce((s, x) => s + x.weight, 0);
    let r = rng() * total;
    let i = 0;
    for (; i < left.length - 1; i++) {
      r -= left[i].weight;
      if (r < 0) break;
    }
    out.push(left.splice(i, 1)[0]);
  }
  return out;
}

/** Sonuç satırı şu an ödülü alacak kişi mi? (kazanan ya da kazanana geçmiş yedek; "gelmedi" değil) */
export const isActiveWinner = (r) =>
  (r.kind === KIND.winner && r.status === RESULT.waiting) ||
  (r.kind === KIND.backup && r.status === RESULT.promoted) ||
  r.status === RESULT.delivered;

/** Bekleyen yedek dışındaki herkes (kazananlar, gelmeyenler, kazanana geçen yedekler) havuzdan çıkar. */
export const leavesPool = (r) => !(r.kind === KIND.backup && r.status === RESULT.waiting);

/**
 * Kullanıcı belgesindeki wins haritasından katılımcıya gösterilecek liste.
 * Yedeklik bilgisi gösterilmez: kazanana geçen yedek de "bekliyor" görünür.
 */
export function winsOf(user) {
  return Object.entries(user.wins || {})
    .filter(([, w]) => w.status === RESULT.waiting || w.status === RESULT.delivered)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([, w]) => ({ category: w.raffleName, prize: w.prize || '', status: w.status }));
}
