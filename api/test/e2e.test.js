/**
 * API'nin uçtan uca testi: gerçek Express uygulaması + bellek içi Firestore.
 * Çalıştırma: npm run test:e2e
 */
import { test, mock, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { FakeFirestore, FieldValue, AggregateField } from '../dev/fake-firestore.js';

process.env.CODE_SECRET = 'e2e-test-secret-0123456789';
const db = new FakeFirestore();

mock.module('firebase-admin/firestore', { namedExports: { FieldValue, AggregateField } });
mock.module(new URL('../src/firebase.js', import.meta.url).href, {
  namedExports: {
    db,
    // Test jetonu: "uid|email"
    auth: {
      verifyIdToken: async (t) => {
        const [uid, email] = t.split('|');
        if (!uid) throw new Error('bad token');
        return { uid, email };
      },
    },
  },
});

const { createApp } = await import('../src/app.js');
const { clearCaches } = await import('../src/config.js');
const { clearBoardCache, THROTTLE } = await import('../src/service.js');
const { currentRotating, rotatingCode, periodOf } = await import('../src/codes.js');

let server, base;
before(async () => {
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}/api`;
});
after(() => server.close());

const fresh = () => { clearCaches(); clearBoardCache(); };

async function call(method, path, { as, body } = {}) {
  const headers = {};
  if (as) headers.authorization = `Bearer ${as}`;
  if (body) headers['content-type'] = 'application/json';
  const res = await fetch(base + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* csv */ }
  return { status: res.status, json, text, headers: res.headers };
}

const ALI = 'u-ali|ali@gmail.com';
const AYSE = 'u-ayse|ayse@gmail.com';
const CAN = 'u-can|can@gmail.com';
const STAFF = 'u-staff|gorevli@gmail.com';
const ADMIN = 'u-admin|yonetici@gmail.com';

const LINKEDIN = { id: 'linkedin', name: 'LinkedIn Paylaşımı', type: 'rotating', reward: 3, rotateMinutes: 60 };

async function seed() {
  await db.doc('config/event').set({
    event: { name: 'Test' },
    tasks: [
      { id: 'stand', name: 'Stant Turu', type: 'static', reward: 1, steps: [{ id: 'st-a', label: 'Stant A' }, { id: 'st-b', label: 'Stant B' }] },
      { id: 'session', name: 'Oturumlar', type: 'session', reward: 1 },
      LINKEDIN,
    ],
    sessions: [
      { id: 's1', slot: '09:00', hall: 'Ana Salon', title: 'Açılış' },
      { id: 's2', slot: '10:00', hall: 'Salon A', title: 'Serverless' },
      { id: 's3', slot: '10:00', hall: 'Salon B', title: 'Flutter' },
    ],
  });
  await db.doc('codes/111111').set({ kind: 'step', taskId: 'stand', stepId: 'st-a', label: 'Stant A' });
  await db.doc('codes/222222').set({ kind: 'step', taskId: 'stand', stepId: 'st-b', label: 'Stant B' });
  await db.doc('codes/309000').set({ kind: 'session', taskId: 'session', sessionId: 's1', slot: '09:00', label: 'Açılış' });
  await db.doc('codes/310001').set({ kind: 'session', taskId: 'session', sessionId: 's2', slot: '10:00', label: 'Serverless' });
  await db.doc('codes/310002').set({ kind: 'session', taskId: 'session', sessionId: 's3', slot: '10:00', label: 'Flutter' });
  await db.doc('roles/gorevli@gmail.com').set({ role: 'staff' });
  await db.doc('roles/yonetici@gmail.com').set({ role: 'admin' });
  fresh();
}

const reg = (as, firstName, phone) =>
  call('POST', '/register', { as, body: { firstName, lastName: 'Yılmaz', phone, kvkk: true } });

test('yapılandırma yokken anlaşılır hata', async () => {
  const r = await call('GET', '/config');
  assert.equal(r.status, 503);
  assert.equal(r.json.error.code, 'NOT_CONFIGURED');
});

test('config istemciye kod sızdırmaz', async () => {
  await seed();
  const r = await call('GET', '/config');
  assert.equal(r.status, 200);
  assert.ok(!r.text.includes('111111'));
  assert.equal(r.json.tasks.find((t) => t.id === 'session').total, 2); // 2 farklı saat dilimi
  assert.equal(r.json.tasks.find((t) => t.id === 'stand').total, 2);
  assert.match(r.headers.get('cache-control'), /s-maxage/);
});

test('kimlik doğrulama ve kayıt (kimlik = Gmail)', async () => {
  assert.equal((await call('GET', '/me')).status, 401);
  const nr = await call('GET', '/me', { as: ALI });
  assert.equal(nr.status, 404);
  assert.equal(nr.json.error.code, 'NOT_REGISTERED');

  const bad = await call('POST', '/register', { as: ALI, body: { firstName: 'Ali', lastName: 'Y', phone: '05321112233' } });
  assert.equal(bad.json.error.code, 'KVKK_REQUIRED');

  const ok = await reg(ALI, 'Ali', '0532 111 22 33');
  assert.equal(ok.status, 201);
  assert.equal(ok.json.email, 'ali@gmail.com');
  assert.equal(ok.json.phone, '05321112233');
  assert.equal(ok.json.tickets, 0);

  assert.equal((await reg(ALI, 'Ali', '')).json.error.code, 'ALREADY_REGISTERED');
  assert.equal((await reg(AYSE, 'Ayşe', '+90 532 111 22 33')).json.error.code, 'PHONE_TAKEN');
  assert.equal((await reg(AYSE, 'Ayşe', '05321112244')).status, 201);

  // Telefon isteğe bağlı
  const can = await reg(CAN, 'Can', '');
  assert.equal(can.status, 201);
  assert.equal(can.json.phone, null);
});

test('kayıt niyeti: bağlantı başka tarayıcıda açılsa da kayıt tamamlanır', async () => {
  const DENIZ = 'u-deniz|deniz@gmail.com';
  const bad = await call('POST', '/register/intent', { body: { email: 'x@ogr.selcuk.edu.tr', firstName: 'X', lastName: 'Y', kvkk: true } });
  assert.equal(bad.json.error.code, 'GMAIL_REQUIRED');
  const dup = await call('POST', '/register/intent', { body: { email: 'ali@gmail.com', firstName: 'X', lastName: 'Y', kvkk: true } });
  assert.equal(dup.json.error.code, 'ALREADY_REGISTERED');

  // Niyet yokken boş kayıt → form istenir
  const none = await call('POST', '/register', { as: DENIZ, body: {} });
  assert.equal(none.json.error.code, 'NEEDS_DETAILS');

  const i = await call('POST', '/register/intent', { body: { email: 'Deniz@Gmail.com', firstName: 'Deniz', lastName: 'Ak', phone: '', kvkk: true } });
  assert.equal(i.status, 204);
  const r = await call('POST', '/register', { as: DENIZ, body: {} });
  assert.equal(r.status, 201);
  assert.equal(r.json.firstName, 'Deniz');
  assert.equal(db.store.has('intents/deniz@gmail.com'), false, 'niyet kayıttan sonra silinir');
});

test('öğrenci/kurum maili kabul edilmez', async () => {
  const OGR = 'u-ogr|203301001@ogr.selcuk.edu.tr';
  const me = await call('GET', '/me', { as: OGR });
  assert.equal(me.status, 403);
  assert.equal(me.json.error.code, 'GMAIL_REQUIRED');
  const r = await reg(OGR, 'Öğrenci', '');
  assert.equal(r.json.error.code, 'GMAIL_REQUIRED');
});

test('kayıtsız kullanıcı kod giremez', async () => {
  const r = await call('POST', '/redeem', { as: 'u-yok|yok@gmail.com', body: { code: '111111' } });
  assert.equal(r.status, 403);
});

test('stant kodu bir kez kullanılır', async () => {
  const r1 = await call('POST', '/redeem', { as: ALI, body: { code: '111111' } });
  assert.equal(r1.status, 200);
  assert.equal(r1.json.user.tickets, 1);
  assert.deepEqual(r1.json.user.done, ['st-a']);
  assert.equal(r1.json.user.progress.stand, 1);

  const r2 = await call('POST', '/redeem', { as: ALI, body: { code: '111111' } });
  assert.equal(r2.status, 409);
  assert.equal(r2.json.error.code, 'ALREADY_USED');
});

test('format hatası', async () => {
  const r = await call('POST', '/redeem', { as: ALI, body: { code: '12ab' } });
  assert.equal(r.json.error.code, 'INVALID_FORMAT');
});

test('aynı saatte iki oturuma katılınamaz', async () => {
  const a = await call('POST', '/redeem', { as: ALI, body: { code: '310001' } });
  assert.equal(a.status, 200);
  assert.equal(a.json.user.sessions['1000'], 's2');

  const b = await call('POST', '/redeem', { as: ALI, body: { code: '310002' } });
  assert.equal(b.status, 409);
  assert.equal(b.json.error.code, 'SESSION_CONFLICT');
  assert.match(b.json.error.message, /Aynı anda 2 oturuma katılamazsınız/);
  assert.match(b.json.error.message, /Serverless/);

  const c = await call('POST', '/redeem', { as: ALI, body: { code: '310001' } });
  assert.equal(c.json.error.code, 'ALREADY_USED');

  const d = await call('POST', '/redeem', { as: ALI, body: { code: '309000' } });
  assert.equal(d.status, 200);
  assert.equal(d.json.user.progress.session, 2);
  assert.equal(d.json.user.tickets, 3);
});

test('saatlik kod: güncel kabul, tekrar ve süresi dolmuş red', async () => {
  const now = currentRotating(process.env.CODE_SECRET, LINKEDIN);
  const r = await call('POST', '/redeem', { as: AYSE, body: { code: now.code } });
  assert.equal(r.status, 200);
  assert.equal(r.json.user.tickets, 3);

  const again = await call('POST', '/redeem', { as: AYSE, body: { code: now.code } });
  assert.equal(again.json.error.code, 'ALREADY_USED');

  const bucket = Math.floor(Date.now() / 1000 / periodOf(LINKEDIN));
  const old = rotatingCode(process.env.CODE_SECRET, 'linkedin', bucket - 2);
  const exp = await call('POST', '/redeem', { as: CAN, body: { code: old } });
  assert.equal(exp.status, 410);
  assert.equal(exp.json.error.code, 'EXPIRED');
});

test('aynı kod eşzamanlı 5 kez gönderilirse yalnızca biri geçer', async () => {
  const rs = await Promise.all(Array.from({ length: 5 }, () => call('POST', '/redeem', { as: CAN, body: { code: '222222' } })));
  assert.equal(rs.filter((r) => r.status === 200).length, 1);
  assert.equal(rs.filter((r) => r.json?.error?.code === 'ALREADY_USED').length, 4);
  const me = await call('GET', '/me', { as: CAN });
  assert.equal(me.json.tickets, 1);
});

test('yanlış kod denemesi sınırı', async () => {
  let last;
  for (let i = 0; i < THROTTLE.maxFails; i++) {
    last = await call('POST', '/redeem', { as: CAN, body: { code: String(900000 + i) } });
    assert.equal(last.json.error.code, 'NOT_FOUND');
  }
  assert.match(last.json.error.message, /5 dakika/);
  const locked = await call('POST', '/redeem', { as: CAN, body: { code: '111111' } });
  assert.equal(locked.status, 429);
  assert.equal(locked.json.error.code, 'LOCKED');
});

test('sıralama: hak sayısı, eşitlikte önce ulaşan, soyad baş harfi', async () => {
  fresh();
  const r = await call('GET', '/leaderboard');
  assert.equal(r.status, 200);
  assert.equal(r.json.participants, 4);
  // Ali 3 hak (önce ulaştı), Ayşe 3 hak, Can 1 hak
  assert.deepEqual(r.json.top.map((x) => [x.name, x.tickets]), [['Ali Y.', 3], ['Ayşe Y.', 3], ['Can Y.', 1]]);
  const me0 = await call('GET', '/me', { as: ALI });
  assert.equal(r.json.top[0].id, me0.json.publicId);
  assert.ok(!r.text.includes('u-ali'), 'uid sızmamalı');
  assert.ok(!r.text.includes('0532'), 'telefon sızmamalı');
  assert.ok(!r.text.includes('@gmail'), 'e-posta sızmamalı');

  const me = await call('GET', '/me', { as: CAN });
  assert.equal(me.json.rank, 3);
});

test('görevli uçları rol ister', async () => {
  assert.equal((await call('GET', '/staff/codes', { as: ALI })).status, 403);
  const s = await call('GET', '/staff/codes', { as: STAFF });
  assert.equal(s.status, 200);
  assert.equal(s.json[0].taskId, 'linkedin');
  assert.match(s.json[0].code, /^\d{6}$/);
  assert.equal((await call('GET', '/admin/stats', { as: STAFF })).status, 403);
});

test('görevli katılımcı adına kod girer', async () => {
  const r = await call('POST', '/staff/redeem', { as: STAFF, body: { email: ' Ayse@Gmail.com ', code: '111111' } });
  assert.equal(r.status, 200);
  assert.equal(r.json.user.email, 'ayse@gmail.com');
  assert.equal(r.json.user.tickets, 4);
  assert.equal(db.store.get('redemptions/u-ayse_st-a').via, 'staff:gorevli@gmail.com');
  const nf = await call('POST', '/staff/redeem', { as: STAFF, body: { email: 'kimse@gmail.com', code: '111111' } });
  assert.equal(nf.json.error.code, 'USER_NOT_FOUND');
});

test('yönetici istatistik ve çekiliş dosyaları', async () => {
  fresh();
  const st = await call('GET', '/admin/stats', { as: ADMIN });
  assert.equal(st.status, 200);
  assert.equal(st.json.users, 4);
  assert.equal(st.json.tickets, 3 + 4 + 1);
  assert.equal(st.json.tasks.find((t) => t.id === 'session').completions, 2);

  const hak = await call('GET', '/admin/export?mode=hak', { as: ADMIN });
  assert.match(hak.headers.get('content-type'), /text\/csv/);
  const hakRows = hak.text.replace(/^﻿/, '').split('\r\n');
  assert.equal(hakRows[0], 'Zaman damgası,Ad Soyad,Telefon,E-posta,Hak no');
  assert.equal(hakRows.length - 1, 8);
  assert.equal(hakRows.filter((l) => l.includes(',ayse@gmail.com,')).length, 4);
  assert.ok(hakRows.some((l) => l.includes('Can Yılmaz,,can@gmail.com,')), 'telefonsuz kişi boş telefonla çıkar');

  const ot = await call('GET', '/admin/export?mode=oturum', { as: ADMIN });
  const otRows = ot.text.replace(/^﻿/, '').split('\r\n').slice(1);
  assert.equal(otRows.length, 2);
  assert.ok(otRows.every((l) => l.includes('Ali Yılmaz,05321112233')));

  const oz = await call('GET', '/admin/export', { as: ADMIN });
  assert.match(oz.text, /Çekiliş hakkı,Stant Turu,Oturumlar,LinkedIn Paylaşımı/);
});

test('bilinmeyen uç 404 JSON döner', async () => {
  const r = await call('GET', '/yok');
  assert.equal(r.status, 404);
  assert.equal(r.json.error.code, 'NO_ROUTE');
});

/* ================================================================== */
/* Çekiliş                                                             */
/* ================================================================== */

const RAFFLES = [
  { id: 'gorev', name: 'Görev Çekilişi', tasks: ['stand', 'linkedin'], weight: 'tickets' },
  { id: 'oturum', name: 'Oturum Çekilişi', tasks: ['session'], weight: 'count' },
];

/** uid → test jetonu (kullanıcı belgesinin e-postası uid@gmail.com) */
const tok = (uid) => `${uid}|${uid}@gmail.com`;

const person = (uid, firstName, progress = {}, extra = {}) =>
  db.doc(`users/${uid}`).set({
    firstName, lastName: 'Test', email: `${uid}@gmail.com`, phone: null, tickets: 0,
    progress, done: [], sessions: {}, createdAt: 1, lastTicketAt: 1, ...extra,
  });

/** Boş veritabanı + çekiliş yapılandırması. people verilmezse standart 5 katılımcı + görevli + yönetici. */
async function seedRaffles(people) {
  db.reset();
  await db.doc('config/event').set({
    event: { name: 'Test' },
    tasks: [
      { id: 'stand', name: 'Stant Turu', type: 'static', reward: 1, steps: [{ id: 'st-a', label: 'Stant A' }] },
      { id: 'session', name: 'Oturumlar', type: 'session', reward: 1 },
      LINKEDIN,
    ],
    sessions: [],
    raffles: RAFFLES,
  });
  await db.doc('roles/gorevli@gmail.com').set({ role: 'staff' });
  await db.doc('roles/yonetici@gmail.com').set({ role: 'admin' });
  if (people) {
    for (const [uid, name, progress] of people) await person(uid, name, progress);
  } else {
    await person('ada', 'Ada', { stand: 2, linkedin: 1 }, { phone: '05321112233' }); // görev şansı 2·1 + 1·3 = 5
    await person('bora', 'Bora', { stand: 1 });                                      // görev 1
    await person('cem', 'Cem', { stand: 3, session: 2 });                            // görev 3, oturum 2
    await person('defne', 'Defne', { session: 1 });                                  // oturum 1
    await person('ece', 'Ece', {});                                                  // şansı 0: hiç havuza girmez
    await person('gorevli', 'Görevli', { stand: 10, session: 10 });                  // roles: havuza girmez
    await person('yonetici', 'Yönetici', { stand: 10, session: 10 });                // roles: havuza girmez
  }
  fresh();
}

const draw = (body, as = ADMIN) => call('POST', '/admin/draws', { as, body: { raffleId: 'gorev', winners: 1, backups: 0, ...body } });
const mark = (id, index, status) => call('POST', `/admin/draws/${id}/results/${index}`, { as: ADMIN, body: { status } });
const cancel = (id) => call('POST', `/admin/draws/${id}/cancel`, { as: ADMIN });
const pools = async () => Object.fromEntries((await call('GET', '/admin/raffles', { as: ADMIN })).json.map((r) => [r.id, r]));
const idxOf = (d, kind, order) => d.results.findIndex((r) => r.kind === kind && r.order === order);
const uidsOf = (d) => d.results.map((r) => r.uid);

test('çekiliş uçları yalnızca yönetici rolüne açık', async () => {
  await seedRaffles();
  const endpoints = [
    ['GET', '/admin/raffles'],
    ['GET', '/admin/raffles/gorev/names'],
    ['POST', '/admin/draws', { raffleId: 'gorev', winners: 1 }],
    ['GET', '/admin/draws'],
    ['GET', '/admin/draws/export'],
    ['POST', '/admin/draws/x/results/0', { status: 'gelmedi' }],
    ['POST', '/admin/draws/x/cancel'],
  ];
  for (const [method, path, body] of endpoints) {
    assert.equal((await call(method, path, { body })).status, 401, `${method} ${path} kimliksiz`);
    assert.equal((await call(method, path, { as: tok('ada'), body })).status, 403, `${method} ${path} katılımcı`);
    const staff = await call(method, path, { as: STAFF, body });
    assert.equal(staff.status, 403, `${method} ${path} görevli`);
    assert.equal(staff.json.error.code, 'FORBIDDEN');
  }
  assert.equal([...db.store.keys()].filter((k) => k.startsWith('draws/')).length, 0, 'yetkisiz istek kayıt oluşturmamalı');
});

test('kategori listesi: havuz büyüklüğü ve toplam şans; görevli/yönetici ve şansı 0 olanlar sayılmaz', async () => {
  await seedRaffles();
  const r = await call('GET', '/admin/raffles', { as: ADMIN });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('cache-control'), 'no-store');
  const by = Object.fromEntries(r.json.map((x) => [x.id, x]));
  assert.equal(by.gorev.name, 'Görev Çekilişi');
  assert.equal(by.gorev.poolSize, 3); // ada, bora, cem
  assert.equal(by.gorev.totalWeight, 5 + 1 + 3);
  assert.equal(by.oturum.poolSize, 2); // cem, defne
  assert.equal(by.oturum.totalWeight, 2 + 1);
});

test('çekiliş: havuz yetmezse çekilebildiği kadar, yanıtta belirtilir; kayıt alanları', async () => {
  await seedRaffles();
  const r = await draw({ winners: 5, backups: 2, prize: '  Kulaklık,  siyah ' });
  assert.equal(r.status, 201);
  assert.equal(r.headers.get('cache-control'), 'no-store');
  const d = r.json;
  assert.equal(d.short, true);
  assert.match(d.message, /Havuzda yalnızca 3 kişi/);
  assert.equal(d.winnersDrawn, 3);
  assert.equal(d.backupsDrawn, 0);
  assert.equal(d.winnersWanted, 5);
  assert.equal(d.backupsWanted, 2);
  assert.equal(d.poolSize, 3);
  assert.equal(d.totalWeight, 9);
  assert.equal(d.prize, 'Kulaklık, siyah');
  assert.equal(d.raffleId, 'gorev');
  assert.equal(d.raffleName, 'Görev Çekilişi');
  assert.equal(d.drawnBy, 'yonetici@gmail.com');
  assert.equal(d.status, 'aktif');
  assert.ok(d.drawnAt > 0);
  assert.deepEqual([...uidsOf(d)].sort(), ['ada', 'bora', 'cem']);
  const ada = d.results.find((x) => x.uid === 'ada');
  assert.deepEqual(
    { firstName: ada.firstName, lastName: ada.lastName, email: ada.email, phone: ada.phone, weight: ada.weight, kind: ada.kind, status: ada.status },
    { firstName: 'Ada', lastName: 'Test', email: 'ada@gmail.com', phone: '05321112233', weight: 5, kind: 'kazanan', status: 'bekliyor' },
  );
  assert.deepEqual(d.results.map((x) => x.order).sort(), [1, 2, 3]);

  // Kayıt veritabanına yazıldı; kazananın kullanıcı belgesine de çekiliş bilgisi işlendi
  assert.equal(db.store.get(`draws/${d.id}`).results.length, 3);
  assert.equal(db.store.get('users/ada').wins[d.id].status, 'bekliyor');
  assert.equal(db.store.get('users/ada').progress.stand, 2, 'ilerleme alanlarına dokunulmaz');
  assert.equal(db.store.has('locks/draw'), false, 'kilit bırakılmış olmalı');
});

test('çekiliş: sayı ve ödül doğrulaması, bilinmeyen kategori, boş havuz', async () => {
  await seedRaffles();
  for (const bad of [{ winners: 0 }, { winners: 51 }, { winners: 1.5 }, { winners: 'x' }, { winners: undefined }, { backups: -1 }, { backups: 51 }, { backups: 'iki' }]) {
    const r = await draw(bad);
    assert.equal(r.status, 400, JSON.stringify(bad));
    assert.equal(r.json.error.code, 'INVALID_COUNT');
  }
  assert.equal((await draw({ prize: 'x'.repeat(121) })).json.error.code, 'INVALID_PRIZE');
  const nf = await draw({ raffleId: 'yok' });
  assert.equal(nf.status, 404);
  assert.equal(nf.json.error.code, 'RAFFLE_NOT_FOUND');

  const ok = await draw({ winners: 50, backups: 50 });
  assert.equal(ok.status, 201, 'üst sınırlar geçerli');

  await seedRaffles([['ece', 'Ece', {}]]);
  const empty = await draw({});
  assert.equal(empty.status, 409);
  assert.equal(empty.json.error.code, 'EMPTY_POOL');
  assert.equal([...db.store.keys()].filter((k) => k.startsWith('draws/')).length, 0);
});

test('havuz dışı: kazananlar tüm kategorilerde, gelmeyenler ve görevli/yönetici çıkar; iptal edilince hepsi döner', async () => {
  await seedRaffles();
  const d = (await draw({ winners: 3 })).json; // ada, bora, cem hepsi kazandı
  let p = await pools();
  assert.equal(p.gorev.poolSize, 0, 'a) kazananlar havuza giremez');
  assert.equal(p.oturum.poolSize, 1, 'a) cem başka kategoride de çıkarılır; geriye defne');

  const cemIdx = d.results.findIndex((r) => r.uid === 'cem');
  const m = await mark(d.id, cemIdx, 'gelmedi');
  assert.equal(m.status, 200);
  p = await pools();
  assert.equal(p.oturum.poolSize, 1, 'b) "gelmedi" işaretlenen kazanan da havuza dönmez');
  assert.equal(p.oturum.totalWeight, 1);

  const second = await draw({ raffleId: 'oturum', winners: 5 });
  assert.deepEqual(uidsOf(second.json), ['defne'], 'c) görevli/yönetici çıkmaz, şansı 0 olan çıkmaz');
  assert.equal((await draw({ raffleId: 'oturum' })).json.error.code, 'EMPTY_POOL');

  assert.equal((await cancel(d.id)).status, 200);
  p = await pools();
  assert.equal(p.gorev.poolSize, 3, 'iptal: kazananlar (gelmedi dahil) havuza geri döner');
  assert.equal(p.oturum.poolSize, 1, 'cem döndü ama defne ikinci çekilişte kazandı');
  assert.equal((await cancel(second.json.id)).status, 200);
  p = await pools();
  assert.equal(p.oturum.poolSize, 2);
});

test('ağırlıklı seçim: yüksek şanslı kişi çok daha sık çıkar', async () => {
  await seedRaffles([['yuksek', 'Yüksek', { stand: 90 }], ['dusuk', 'Düşük', { stand: 10 }]]);
  let high = 0;
  const N = 50; // beklenen 45, standart sapma ~2.1; 35 altı ≈ 4.7 sigma
  for (let i = 0; i < N; i++) {
    const r = await draw({ winners: 1 });
    assert.equal(r.status, 201);
    if (r.json.results[0].uid === 'yuksek') high++;
    await cancel(r.json.id);
  }
  assert.ok(high >= 35, `yüksek şanslı ${N} çekilişin yalnızca ${high} tanesini aldı`);
});

test('iadesiz seçim: kazanan ve yedekler tekrarsız, önce kazananlar sonra yedekler', async () => {
  await seedRaffles(Array.from({ length: 8 }, (_, i) => [`k${i}`, `K${i}`, { stand: i + 1 }]));
  for (let t = 0; t < 10; t++) {
    const r = await draw({ winners: 4, backups: 4 });
    const d = r.json;
    assert.equal(d.results.length, 8);
    assert.equal(new Set(uidsOf(d)).size, 8, 'aynı kişi iki kez çıkmamalı');
    assert.deepEqual(d.results.map((x) => x.kind), ['kazanan', 'kazanan', 'kazanan', 'kazanan', 'yedek', 'yedek', 'yedek', 'yedek']);
    assert.deepEqual(d.results.map((x) => x.order), [1, 2, 3, 4, 1, 2, 3, 4]);
    assert.equal(d.short, false);
    assert.equal(d.message, null);
    await cancel(d.id);
  }
});

test('yedek olarak çıkmak kişiyi havuzdan çıkarmaz', async () => {
  await seedRaffles([['a', 'A', { stand: 1 }], ['b', 'B', { stand: 1 }], ['c', 'C', { stand: 1 }]]);
  const first = (await draw({ winners: 1, backups: 1 })).json;
  assert.equal(first.results.length, 2);
  assert.equal((await pools()).gorev.poolSize, 2, 'kazanan çıktı; yedek ve çekilmeyen havuzda');
  const backupUid = first.results.find((r) => r.kind === 'yedek').uid;

  const second = (await draw({ winners: 2 })).json; // havuzdaki iki kişinin ikisi de çıkar
  assert.ok(uidsOf(second).includes(backupUid), 'önceki çekilişin yedeği yeni çekilişte kazanabilir');
  assert.ok(!uidsOf(second).includes(first.results[0].uid), 'önceki kazanan çıkamaz');
});

test('gelmedi → sıradaki bekleyen yedek kazanana geçer; teslim edildi; geri alma yok', async () => {
  await seedRaffles(Array.from({ length: 4 }, (_, i) => [`p${i}`, `P${i}`, { stand: 1 }]));
  const d = (await draw({ winners: 2, backups: 2, prize: 'Tişört' })).json;
  const [w1, w2] = [idxOf(d, 'kazanan', 1), idxOf(d, 'kazanan', 2)];
  const [b1, b2] = [idxOf(d, 'yedek', 1), idxOf(d, 'yedek', 2)];
  const uid = (i) => d.results[i].uid;

  // Çekilişten hemen sonra: yalnızca kazananlar "Kazandın" görür, yedekler hiçbir şey görmez
  const wins = async (u) => (await call('GET', '/me', { as: tok(u) })).json.wins;
  assert.deepEqual(await wins(uid(w1)), [{ category: 'Görev Çekilişi', prize: 'Tişört', status: 'bekliyor' }]);
  assert.deepEqual(await wins(uid(b1)), []);

  assert.equal((await mark(d.id, b1, 'teslim edildi')).json.error.code, 'NOT_WINNER', 'henüz kazanana geçmeyen yedek işaretlenemez');
  assert.equal((await mark(d.id, w1, 'belki')).json.error.code, 'INVALID_STATUS');
  assert.equal((await mark(d.id, 99, 'gelmedi')).json.error.code, 'RESULT_NOT_FOUND');
  assert.equal((await mark('yok', 0, 'gelmedi')).json.error.code, 'DRAW_NOT_FOUND');

  const g = await mark(d.id, w1, 'gelmedi');
  assert.equal(g.status, 200);
  assert.equal(g.json.promoted.order, 1);
  assert.equal(g.json.promoted.index, b1);
  assert.match(g.json.message, /kazanana geçti/);
  assert.equal(g.json.results[w1].status, 'gelmedi');
  assert.equal(g.json.results[b1].status, 'yedekten kazanana geçti');
  assert.equal(g.json.results[b2].status, 'bekliyor');
  assert.deepEqual(await wins(uid(w1)), [], 'gelmeyen kişide Kazandın kartı kalkar');
  assert.deepEqual(await wins(uid(b1)), [{ category: 'Görev Çekilişi', prize: 'Tişört', status: 'bekliyor' }], 'yedeklik bilgisi gösterilmez');
  assert.deepEqual(await wins(uid(b2)), []);

  assert.equal((await mark(d.id, w1, 'teslim edildi')).json.error.code, 'ALREADY_SET', '"gelmedi" geri alınamaz');

  const t = await mark(d.id, w2, 'teslim edildi');
  assert.equal(t.status, 200);
  assert.equal(t.json.promoted, null);
  assert.equal(t.json.results[w2].status, 'teslim edildi');
  assert.deepEqual(await wins(uid(w2)), [{ category: 'Görev Çekilişi', prize: 'Tişört', status: 'teslim edildi' }]);
  assert.equal((await mark(d.id, w2, 'teslim edildi')).status, 200, 'aynı işaretin tekrarı zararsız');
  assert.equal((await mark(d.id, w2, 'gelmedi')).json.error.code, 'ALREADY_SET', 'teslim edilen sonradan "gelmedi" yapılamaz');

  // Kazanana geçen yedek de gelmezse sıradaki yedek (b2) geçer
  const g2 = await mark(d.id, b1, 'gelmedi');
  assert.equal(g2.json.promoted.order, 2);
  assert.equal(g2.json.results[b2].status, 'yedekten kazanana geçti');

  // Yedek kalmadı: yanıtta söylenir, otomatik yeni çekim yapılmaz
  const g3 = await mark(d.id, b2, 'gelmedi');
  assert.equal(g3.status, 200);
  assert.equal(g3.json.promoted, null);
  assert.match(g3.json.message, /yedek kalmadı/);
  assert.equal((await call('GET', '/admin/draws', { as: ADMIN })).json.length, 1, 'otomatik yeni çekim yok');
  assert.equal((await pools()).gorev.poolSize, 0, 'gelmeyenler ve kazananlar havuzda değil');
});

test('iptal: kayıt silinmez, kazananlar havuza ve pasaportları eski haline döner', async () => {
  await seedRaffles([['a', 'A', { stand: 1 }], ['b', 'B', { stand: 1 }], ['c', 'C', { stand: 1 }]]);
  const d = (await draw({ winners: 2, backups: 1, prize: 'Hediye' })).json;
  const winner = d.results.find((r) => r.kind === 'kazanan').uid;
  assert.equal((await call('GET', '/me', { as: tok(winner) })).json.wins.length, 1);
  assert.equal((await pools()).gorev.poolSize, 1);

  const c = await cancel(d.id);
  assert.equal(c.status, 200);
  assert.equal(c.json.status, 'iptal edildi');
  assert.equal(c.json.cancelledBy, 'yonetici@gmail.com');
  assert.ok(c.json.cancelledAt > 0);

  const list = (await call('GET', '/admin/draws', { as: ADMIN })).json;
  assert.equal(list.length, 1, 'iptal edilen kayıt silinmez');
  assert.equal(list[0].status, 'iptal edildi');
  assert.equal(list[0].results.length, 3, 'sonuçlar da korunur');
  assert.equal((await pools()).gorev.poolSize, 3);
  assert.deepEqual((await call('GET', '/me', { as: tok(winner) })).json.wins, []);

  assert.equal((await cancel(d.id)).json.error.code, 'DRAW_CANCELLED');
  assert.equal((await mark(d.id, 0, 'gelmedi')).json.error.code, 'DRAW_CANCELLED');
  assert.equal((await cancel('yok')).status, 404);
  assert.equal((await draw({ winners: 3 })).status, 201, 'iptal sonrası aynı kişiler yeniden çekilebilir');
});

test('çekilişler yeniden eskiye listelenir', async () => {
  await seedRaffles(Array.from({ length: 6 }, (_, i) => [`q${i}`, `Q${i}`, { stand: 1 }]));
  const a = (await draw({ winners: 1, prize: 'Birinci' })).json;
  await new Promise((r) => setTimeout(r, 5));
  const b = (await draw({ winners: 1, prize: 'İkinci' })).json;
  const list = (await call('GET', '/admin/draws', { as: ADMIN })).json;
  assert.deepEqual(list.map((x) => x.id), [b.id, a.id]);
});

test('eşzamanlı iki çekilişte yalnızca biri geçer; kilit bırakılır, eski kilit düşer', async () => {
  await seedRaffles(Array.from({ length: 6 }, (_, i) => [`z${i}`, `Z${i}`, { stand: 1 }]));
  // Kullanıcı sorgusunu yavaşlat: ilk çekiliş kilidi tutarken ikincisi gelsin
  const realCollection = db.collection.bind(db);
  db.collection = (name) => {
    const q = realCollection(name);
    if (name === 'users') {
      const get = q.get.bind(q);
      q.get = async () => { await new Promise((r) => setTimeout(r, 150)); return get(); };
    }
    return q;
  };
  let rs;
  try {
    rs = await Promise.all([draw({ winners: 1 }), draw({ winners: 1 })]);
  } finally {
    delete db.collection;
  }
  assert.deepEqual(rs.map((r) => r.status).sort(), [201, 409]);
  const lost = rs.find((r) => r.status === 409);
  assert.equal(lost.json.error.code, 'DRAW_BUSY');
  assert.equal([...db.store.keys()].filter((k) => k.startsWith('draws/')).length, 1, 'yalnızca bir kayıt oluşmalı');
  assert.equal(db.store.has('locks/draw'), false, 'kilit bırakılmış olmalı');
  assert.equal((await draw({ winners: 1 })).status, 201, 'kilit bırakıldıktan sonra yeni çekiliş yapılabilir');

  // Takılı kalmış (süresi geçmiş) kilit çekilişi engellemez; taze kilit engeller
  await db.doc('locks/draw').set({ token: 'eski', at: Date.now() - 5 * 60_000 });
  assert.equal((await draw({ winners: 1 })).status, 201);
  await db.doc('locks/draw').set({ token: 'taze', at: Date.now() });
  assert.equal((await draw({ winners: 1 })).json.error.code, 'DRAW_BUSY');
  assert.equal(db.store.get('locks/draw').token, 'taze', 'başkasının kilidini silmez');
});

test('CSV: başlıklar, BOM, sıralama, iptal edilenin durumu', async () => {
  await seedRaffles();
  const d1 = (await draw({ winners: 2, backups: 1, prize: 'Kulaklık, siyah' })).json;
  await new Promise((r) => setTimeout(r, 5));
  const d2 = (await draw({ raffleId: 'oturum', winners: 1 })).json;
  await mark(d1.id, idxOf(d1, 'kazanan', 1), 'teslim edildi');

  const r = await call('GET', '/admin/draws/export', { as: ADMIN });
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /text\/csv/);
  assert.match(r.headers.get('content-disposition'), /attachment/);
  assert.equal(r.headers.get('cache-control'), 'no-store');
  // fetch().text() BOM'u kırpar; Excel için gereken BOM'u ham baytlardan doğrula
  const raw = new Uint8Array(await (await fetch(`${base}/admin/draws/export`, { headers: { authorization: `Bearer ${ADMIN}` } })).arrayBuffer());
  assert.deepEqual([...raw.slice(0, 3)], [0xef, 0xbb, 0xbf], 'UTF-8 BOM ile başlamalı');
  const rows = r.text.replace(/^﻿/, '').split('\r\n');
  assert.equal(rows[0], 'Çekiliş,Kategori,Ödül,Tür,Sıra,Durum,Ad Soyad,Telefon,E-posta,Zaman');
  assert.equal(rows.length - 1, d1.results.length + d2.results.length);

  assert.ok(rows[1].startsWith('1,Görev Çekilişi,"Kulaklık, siyah",kazanan,1,'), 'virgüllü ödül tırnaklanır');
  assert.deepEqual(rows.slice(1, 4).map((l) => (l.includes(',kazanan,') ? 'k' : 'y')), ['k', 'k', 'y'], 'önce kazananlar, sonra yedek');
  assert.ok(rows[1].includes(',teslim edildi,'));
  assert.ok(rows[3].includes(',yedek,1,bekliyor,'));
  assert.ok(rows[4].startsWith('2,Oturum Çekilişi,,kazanan,1,bekliyor,'), 'ödülsüz çekiliş boş ödül sütunuyla');
  const ada = rows.find((l) => l.includes('Ada Test'));
  if (ada) assert.ok(ada.includes(',05321112233,ada@gmail.com,'));

  await cancel(d2.id);
  const after = (await call('GET', '/admin/draws/export', { as: ADMIN })).text.split('\r\n');
  assert.ok(after[4].startsWith('2,Oturum Çekilişi,,kazanan,1,iptal edildi,'), 'iptal edilen çekilişin satırları "iptal edildi" der');
});

test('isim uç noktası yalnızca "ad soyad" döner', async () => {
  await seedRaffles();
  const r = await call('GET', '/admin/raffles/gorev/names', { as: ADMIN });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.deepEqual([...r.json.names].sort(), ['Ada Test', 'Bora Test', 'Cem Test']);
  assert.deepEqual(Object.keys(r.json), ['names']);
  assert.ok(!r.text.includes('@'), 'e-posta sızmamalı');
  assert.ok(!r.text.includes('0532'), 'telefon sızmamalı');
  assert.equal((await call('GET', '/admin/raffles/yok/names', { as: ADMIN })).status, 404);
});

test('/api/me: kazanılan çekilişler wins içinde, teslim edilince durum değişir', async () => {
  await seedRaffles([['a', 'A', { stand: 1 }]]);
  assert.deepEqual((await call('GET', '/me', { as: tok('a') })).json.wins, []);
  const d = (await draw({ winners: 1, prize: 'Powerbank' })).json;
  const me = (await call('GET', '/me', { as: tok('a') })).json;
  assert.deepEqual(me.wins, [{ category: 'Görev Çekilişi', prize: 'Powerbank', status: 'bekliyor' }]);
  assert.equal(me.tickets, 0, 'hak alanlarına dokunulmaz');
  await mark(d.id, 0, 'teslim edildi');
  assert.equal((await call('GET', '/me', { as: tok('a') })).json.wins[0].status, 'teslim edildi');
});
