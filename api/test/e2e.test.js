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
