import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rotatingCode, matchRotating, currentRotating, GRACE_SECONDS } from '../src/codes.js';
import { normalizePhone, validateRegistration, displayName, isAllowedEmail } from '../src/validate.js';
import { weightFor, pickWeighted, validateRaffles, winsOf } from '../src/raffle.js';

const SECRET = 'test-secret-1234567890';
const task = { id: 'linkedin', name: 'LinkedIn', type: 'rotating', rotateMinutes: 60 };
const HOUR = 3600_000;
const base = 1_800_000 * HOUR; // tam saat başı

test('dönen kod deterministik ve 6 hane', () => {
  const a = rotatingCode(SECRET, 'linkedin', 42);
  assert.match(a, /^\d{6}$/);
  assert.equal(a, rotatingCode(SECRET, 'linkedin', 42));
  assert.notEqual(a, rotatingCode(SECRET, 'instagram', 42));
});

test('bu saatin kodu kabul edilir', () => {
  const now = base + 20 * 60_000;
  const { code } = currentRotating(SECRET, task, now);
  assert.equal(matchRotating(SECRET, [task], code, now).status, 'ok');
});

test('önceki saatin kodu tolerans içinde kabul, sonra süresi dolmuş', () => {
  const prevCode = currentRotating(SECRET, task, base - 60_000).code;
  assert.equal(matchRotating(SECRET, [task], prevCode, base + (GRACE_SECONDS - 10) * 1000).status, 'ok');
  assert.equal(matchRotating(SECRET, [task], prevCode, base + (GRACE_SECONDS + 10) * 1000).status, 'expired');
});

test('iki saat önceki kod süresi dolmuş sayılır', () => {
  const old = currentRotating(SECRET, task, base - 2 * HOUR + 60_000).code;
  assert.equal(matchRotating(SECRET, [task], old, base + 30 * 60_000).status, 'expired');
});

test('kalan süre doğru hesaplanır', () => {
  const r = currentRotating(SECRET, task, base + 15 * 60_000);
  assert.equal(r.secondsLeft, 45 * 60);
});

test('telefon normalizasyonu', () => {
  assert.equal(normalizePhone('0532 123 45 67'), '05321234567');
  assert.equal(normalizePhone('5321234567'), '05321234567');
  assert.equal(normalizePhone('+90 532 123 45 67'), '05321234567');
  assert.equal(normalizePhone('0212 123 45 67'), null);
  assert.equal(normalizePhone('123'), null);
});

test('kayıt doğrulaması: telefon isteğe bağlı', () => {
  const ok = validateRegistration({ firstName: ' Talha ', lastName: 'Kara', phone: '05321234567', kvkk: true });
  assert.deepEqual(ok, { firstName: 'Talha', lastName: 'Kara', phone: '05321234567' });
  assert.equal(validateRegistration({ firstName: 'A', lastName: 'B', phone: '  ', kvkk: true }).phone, null);
  assert.equal(validateRegistration({ firstName: 'A', lastName: 'B', kvkk: true }).phone, null);
  assert.throws(() => validateRegistration({ firstName: 'A', lastName: 'B', phone: '123', kvkk: true }), /boş bırak/);
  assert.throws(() => validateRegistration({ ...ok, kvkk: false }), /aydınlatma/);
  assert.throws(() => validateRegistration({ firstName: '', lastName: 'B', kvkk: true }), /Ad ve soyad/);
});

test('yalnızca kişisel Gmail', () => {
  assert.equal(isAllowedEmail('ali@gmail.com'), true);
  assert.equal(isAllowedEmail('Ali@GoogleMail.com'), true);
  assert.equal(isAllowedEmail('203301001@ogr.selcuk.edu.tr'), false);
  assert.equal(isAllowedEmail('ali@hotmail.com'), false);
  assert.equal(isAllowedEmail(''), false);
});

test('sıralamada soyadın baş harfi', () => {
  assert.equal(displayName({ firstName: 'Zeynep', lastName: 'ılgaz' }), 'Zeynep I.');
  assert.equal(displayName({ firstName: 'Ece', lastName: 'işık' }), 'Ece İ.');
});

/* ---------- Çekiliş kuralları ---------- */

const RCFG = {
  tasks: [
    { id: 'stand', reward: 1 },
    { id: 'linkedin', reward: 3 },
    { id: 'session', reward: 1 },
  ],
};
const GOREV = { id: 'gorev', name: 'Görev Çekilişi', tasks: ['stand', 'linkedin'], weight: 'tickets' };
const OTURUM = { id: 'oturum', name: 'Oturum Çekilişi', tasks: ['session'], weight: 'count' };

test('şans: "tickets" ilerleme × ödül, "count" yalnızca ilerleme toplamı', () => {
  const u = { progress: { stand: 2, linkedin: 1, session: 4 } };
  assert.equal(weightFor(u, GOREV, RCFG), 2 * 1 + 1 * 3);
  assert.equal(weightFor(u, OTURUM, RCFG), 4);
  assert.equal(weightFor({ progress: { stand: 5 } }, OTURUM, RCFG), 0, 'listede olmayan görev sayılmaz');
  assert.equal(weightFor({}, GOREV, RCFG), 0);
  assert.equal(weightFor(u, { ...GOREV, weight: 'count' }, RCFG), 3, 'count: 2 stant + 1 linkedin');
});

test('çekiliş kategorisi doğrulaması', () => {
  assert.deepEqual(validateRaffles(undefined, RCFG.tasks), []);
  assert.equal(validateRaffles([GOREV, OTURUM], RCFG.tasks).length, 2);
  assert.throws(() => validateRaffles([{ ...GOREV, tasks: ['stand', 'yok'] }], RCFG.tasks), /bilinmeyen görev id'si “yok”/);
  assert.throws(() => validateRaffles([{ ...GOREV, weight: 'x' }], RCFG.tasks), /weight/);
  assert.throws(() => validateRaffles([{ ...GOREV, tasks: [] }], RCFG.tasks), /tasks/);
  assert.throws(() => validateRaffles([GOREV, GOREV], RCFG.tasks), /Tekrarlanan/);
  assert.throws(() => validateRaffles([{ ...GOREV, id: 'Büyük Harf' }], RCFG.tasks), /Geçersiz/);
  assert.throws(() => validateRaffles([{ ...GOREV, name: ' ' }], RCFG.tasks), /name/);
  assert.throws(() => validateRaffles({}, RCFG.tasks), /dizi/);
});

/** Sabit tohumlu üreteç (mulberry32): testler tekrarlanabilir olsun. */
function seeded(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test('ağırlıklı seçim: şansı yüksek olan orantılı sıklıkta çıkar (sabit tohum)', () => {
  const rng = seeded(42);
  const items = [{ id: 'a', weight: 9 }, { id: 'b', weight: 1 }];
  let a = 0;
  const N = 5000;
  for (let i = 0; i < N; i++) if (pickWeighted(items, 1, rng)[0].id === 'a') a++;
  assert.ok(Math.abs(a / N - 0.9) < 0.02, `a oranı ${a / N}`);
});

test('ağırlıklı seçim: gerçek crypto ile de orantılı (geniş tolerans)', () => {
  const items = [{ id: 'a', weight: 3 }, { id: 'b', weight: 1 }];
  let a = 0;
  const N = 4000;
  for (let i = 0; i < N; i++) if (pickWeighted(items, 1)[0].id === 'a') a++;
  assert.ok(a / N > 0.71 && a / N < 0.79, `a oranı ${a / N}`); // beklenen 0.75, ~6 sigma
});

test('iadesiz seçim: kimse iki kez çıkmaz, sıfır şanslı çıkmaz, sayı havuzu aşmaz', () => {
  const items = Array.from({ length: 10 }, (_, i) => ({ id: i, weight: i === 0 ? 0 : i }));
  for (let t = 0; t < 200; t++) {
    const got = pickWeighted(items, 20);
    assert.equal(got.length, 9, 'şansı sıfır olan çıkarılır, kalan 9 kişi');
    assert.equal(new Set(got.map((x) => x.id)).size, got.length);
    assert.ok(!got.some((x) => x.id === 0));
  }
  assert.equal(pickWeighted(items, 0).length, 0);
  assert.equal(pickWeighted([], 3).length, 0);
});

test('katılımcıya gösterilen kazanımlar: yedeklik ve eleme görünmez', () => {
  const u = {
    wins: {
      a1: { raffleName: 'Görev Çekilişi', prize: 'Kulaklık', status: 'bekliyor' },
      a2: { raffleName: 'Oturum Çekilişi', prize: '', status: 'teslim edildi' },
      a3: { raffleName: 'X', prize: 'Y', status: 'gelmedi' },
      a4: { raffleName: 'X', prize: 'Y', status: 'iptal edildi' },
    },
  };
  assert.deepEqual(winsOf(u), [
    { category: 'Görev Çekilişi', prize: 'Kulaklık', status: 'bekliyor' },
    { category: 'Oturum Çekilişi', prize: '', status: 'teslim edildi' },
  ]);
  assert.deepEqual(winsOf({}), []);
});
