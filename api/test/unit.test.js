import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rotatingCode, matchRotating, currentRotating, GRACE_SECONDS } from '../src/codes.js';
import { normalizePhone, validateRegistration, displayName, isAllowedEmail } from '../src/validate.js';
import { weightFor, pickWeighted, validateRaffles, winsOf } from '../src/raffle.js';
import { validateSchedule } from '../src/schedule.js';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

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

/* ---------- Etkinlik akışı doğrulaması (seed bunu çağırır) ---------- */

const HALLS = [{ id: 'salon-1', name: 'Salon 1' }, { id: 'salon-2', name: 'Salon 2' }];
const sched = (over = {}) => ({
  halls: HALLS,
  sessions: [
    { id: 's1', slot: '10:00', end: '10:45', hall: 'salon-1', title: 'A' },
    { id: 's2', slot: '10:00', end: '10:45', hall: 'salon-2', title: 'B' },
  ],
  agenda: [{ id: 'a1', start: '09:00', end: '09:30', hall: null, title: 'Kayıt' }],
  ...over,
});
const sess = (id, slot, end, hall) => ({ id, slot, end, hall, title: id });

test('akış: geçerli yapı, örnek dosya ve uç uca bitişik maddeler geçer', () => {
  assert.doesNotThrow(() => validateSchedule(sched()));
  const example = JSON.parse(readFileSync(new URL('../seed/event.example.json', import.meta.url), 'utf8'));
  assert.doesNotThrow(() => validateSchedule(example));
  assert.equal(example.sessions.length, 11);
  // 10:45'te biten oturumun hemen ardından 10:45'te başlayan madde çakışma değildir
  assert.doesNotThrow(() => validateSchedule(sched({ agenda: [{ id: 'a1', start: '10:45', end: '11:00', hall: null, title: 'Ara' }] })));
  // agenda hiç yoksa da geçerli
  assert.doesNotThrow(() => validateSchedule(sched({ agenda: undefined })));
});

test('akış: tam olarak 2 salon şart', () => {
  assert.throws(() => validateSchedule(sched({ halls: undefined })), /tam olarak 2 salon/);
  assert.throws(() => validateSchedule(sched({ halls: [HALLS[0]] })), /tam olarak 2 salon/);
  assert.throws(() => validateSchedule(sched({ halls: [...HALLS, { id: 'salon-3', name: 'Salon 3' }] })), /tam olarak 2 salon/);
  assert.throws(() => validateSchedule(sched({ halls: [HALLS[0], { id: 'salon-1', name: 'Başka' }] })), /tekrarlanan salon id/);
  assert.throws(() => validateSchedule(sched({ halls: [HALLS[0], { id: 'salon-2', name: ' ' }] })), /ad yazılmalı/);
});

test('akış: yanlış salon id, saat biçimi ve end <= başlangıç reddedilir', () => {
  const s = (o) => sched({ sessions: [{ id: 's1', slot: '10:00', end: '10:45', hall: 'salon-1', title: 'A', ...o }], agenda: [] });
  assert.throws(() => validateSchedule(s({ hall: 'Ana Salon' })), /bilinmeyen salon "Ana Salon"/);
  assert.throws(() => validateSchedule(s({ hall: null })), /salonu belli olmalı/);
  assert.throws(() => validateSchedule(s({ end: '10:00' })), /end \(10:00\) başlangıçtan \(10:00\) sonra/);
  assert.throws(() => validateSchedule(s({ end: '09:30' })), /sonra olmalı/);
  assert.throws(() => validateSchedule(s({ end: undefined })), /end SS:DD/);
  assert.throws(() => validateSchedule(s({ end: '25:00' })), /end SS:DD/);
  assert.throws(() => validateSchedule(s({ slot: '9:00' })), /başlangıç SS:DD/);
  const a = (o) => sched({ agenda: [{ id: 'a1', start: '12:00', end: '13:00', hall: null, title: 'Öğle', ...o }] });
  assert.throws(() => validateSchedule(a({ hall: 'salon-9' })), /bilinmeyen salon/);
  assert.throws(() => validateSchedule(a({ end: '12:00' })), /sonra olmalı/);
  assert.throws(() => validateSchedule(a({ title: '' })), /title boş/);
});

test('akış: aynı salonda çakışma reddedilir (oturum + agenda birlikte), farklı salon serbest', () => {
  assert.throws(() => validateSchedule(sched({ sessions: [sess('s1', '10:00', '10:45', 'salon-1'), sess('s2', '10:30', '11:15', 'salon-1')], agenda: [] })), /zaman çakışması.*aynı salonda/);
  // paralel oturumlar farklı salonda sorun değil
  assert.doesNotThrow(() => validateSchedule(sched({ sessions: [sess('s1', '10:00', '10:45', 'salon-1'), sess('s2', '10:30', '11:15', 'salon-2')], agenda: [] })));
  // oturum ile o salondaki agenda maddesi
  const ag = (hall) => [{ id: 'a1', start: '10:30', end: '11:00', hall, title: 'Panel' }];
  assert.throws(() => validateSchedule(sched({ agenda: ag('salon-1') })), /zaman çakışması/);
  // "Tüm alan" iki salonu da kaplar: iki salondaki oturumlarla da çakışamaz
  assert.throws(() => validateSchedule(sched({ agenda: ag(null) })), /zaman çakışması/);
  assert.throws(() => validateSchedule(sched({
    sessions: [sess('s2', '10:00', '10:45', 'salon-2')], agenda: ag(null).map((x) => ({ ...x, start: '10:40' })),
  })), /zaman çakışması/);
  // iki "Tüm alan" maddesi de çakışamaz
  assert.throws(() => validateSchedule(sched({ agenda: [{ id: 'a1', start: '09:00', end: '09:30', hall: null, title: 'X' }, { id: 'a2', start: '09:15', end: '09:45', hall: null, title: 'Y' }] })), /zaman çakışması/);
  // başka salona özel agenda maddesi serbest
  assert.doesNotThrow(() => validateSchedule(sched({ sessions: [sess('s1', '10:00', '10:45', 'salon-1')], agenda: [{ id: 'a1', start: '10:00', end: '10:45', hall: 'salon-2', title: 'Atölye' }] })));
});

test('akış: tekrarlanan id (oturum ve agenda arasında da) reddedilir', () => {
  assert.throws(() => validateSchedule(sched({ agenda: [{ id: 's1', start: '09:00', end: '09:30', hall: null, title: 'Kayıt' }] })), /id eksik ya da tekrarlı/);
  assert.throws(() => validateSchedule(sched({ agenda: [{ id: 'a1', start: '09:00', end: '09:30', hall: null, title: 'K' }, { id: 'a1', start: '12:00', end: '13:00', hall: null, title: 'Ö' }] })), /id eksik ya da tekrarlı/);
});

test('seed betiği geçersiz akışta veritabanına dokunmadan çıkış kodu 1 ile durur', () => {
  const dir = mkdtempSync(join(tmpdir(), 'seed-akis-'));
  try {
    const example = JSON.parse(readFileSync(new URL('../seed/event.example.json', import.meta.url), 'utf8'));
    const run = (mutate) => {
      const cfg = structuredClone(example);
      mutate(cfg);
      const file = join(dir, 'event.json');
      writeFileSync(file, JSON.stringify(cfg));
      return spawnSync(process.execPath, [fileURLToPath(new URL('../scripts/seed.js', import.meta.url)), file], { encoding: 'utf8' });
    };
    const cases = [
      [(c) => { c.halls.pop(); }, /tam olarak 2 salon/],
      [(c) => { c.sessions.find((s) => s.hall === 'salon-2').hall = 'salon-1'; }, /zaman çakışması/], // paralel oturumu diğer salona taşı
      [(c) => { c.sessions[0].hall = 'salon-9'; }, /bilinmeyen salon/],
      [(c) => { c.sessions[0].end = c.sessions[0].slot; }, /sonra olmalı/],
      [(c) => { c.agenda[0].id = 's01'; }, /tekrarlı/],
    ];
    for (const [mutate, re] of cases) {
      const r = run(mutate);
      assert.equal(r.status, 1, r.stderr);
      assert.match(r.stderr, re);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
