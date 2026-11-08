/**
 * DEMO MODU — Firebase projesi olmadan sistemi yerelde denemek için.
 *
 *   npm run demo        (kök dizinden: hem API hem ön yüz)
 *
 * - Veritabanı bellek içidir; sunucu kapanınca her şey sıfırlanır.
 * - Kimlik doğrulama sahtedir: "demo:<uid>|<email>" biçimindeki jeton kabul edilir.
 * - Bu dosya yalnızca yerelde çalışır, Cloud Run imajına girmez (.dockerignore).
 */
import { mock } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

if (process.env.K_SERVICE) {
  console.error('Demo modu Cloud Run üzerinde çalıştırılamaz.');
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const { FakeFirestore, FieldValue, AggregateField } = await import('./fake-firestore.js');

process.env.CODE_SECRET ||= 'demo-modu-yerel-sir-0123456789';
const db = new FakeFirestore();

mock.module('firebase-admin/firestore', { namedExports: { FieldValue, AggregateField } });
mock.module(new URL('../src/firebase.js', import.meta.url).href, {
  namedExports: {
    db,
    auth: {
      verifyIdToken: async (token) => {
        const m = /^demo:([^|]+)\|(.+)$/.exec(token);
        if (!m) throw new Error('geçersiz demo jetonu');
        return { uid: m[1], email: m[2].toLowerCase(), email_verified: true };
      },
    },
  },
});

const { createApp } = await import('../src/app.js');
const svc = await import('../src/service.js');

/* ---------- Örnek etkinlik ---------- */
const cfg = JSON.parse(readFileSync(join(here, '..', 'seed', 'event.example.json'), 'utf8'));
const titles = [
  'Açılış ve Keynote', 'Serverless ile ölçeklenmek', 'Flutter’da durum yönetimi', 'Gemini ile ajan geliştirme',
  'Kubernetes’e ilk adım', 'Android’de performans', 'Veri hattı tasarımı', 'Web’de erişilebilirlik',
  'Firebase ile hızlı MVP', 'Kariyer paneli', 'Açık kaynağa katkı',
];
cfg.sessions.forEach((s, i) => {
  s.title = titles[i] || s.title;
  s.speaker = 'Örnek konuşmacı';
});
await db.doc('config/event').set({ event: cfg.event, tasks: cfg.tasks, halls: cfg.halls, sessions: cfg.sessions, agenda: cfg.agenda, raffles: cfg.raffles });

// Akılda kalsın diye sıralı kodlar: stantlar 1xxxxx, oyunlar 2xxxxx, oturumlar 3xxxxx
const codeOf = {};
const rows = [];
for (const t of cfg.tasks.filter((x) => x.type === 'static')) {
  const prefix = t.id === 'stand' ? 1 : t.id === 'game' ? 2 : 4;
  t.steps.forEach((s, i) => {
    const code = `${prefix}0000${i + 1}`;
    codeOf[s.id] = code;
    rows.push([t.name, s.label, code]);
  });
}
const sessionTask = cfg.tasks.find((t) => t.type === 'session');
cfg.sessions.forEach((s, i) => {
  const code = `3000${String(i + 1).padStart(2, '0')}`;
  codeOf[s.id] = code;
  rows.push(['Oturum', `${s.slot} ${cfg.halls.find((h) => h.id === s.hall).name} · ${s.title}`, code]);
});
for (const t of cfg.tasks.filter((x) => x.type === 'static')) {
  for (const s of t.steps) await db.doc(`codes/${codeOf[s.id]}`).set({ kind: 'step', taskId: t.id, stepId: s.id, label: s.label });
}
for (const s of cfg.sessions) {
  await db.doc(`codes/${codeOf[s.id]}`).set({ kind: 'session', taskId: sessionTask.id, sessionId: s.id, slot: s.slot, label: s.title });
}

/* ---------- Test hesapları ---------- */
await db.doc('roles/gorevli.demo@gmail.com').set({ role: 'staff' });
await db.doc('roles/yonetici.demo@gmail.com').set({ role: 'admin' });

const reg = (uid, email, firstName, lastName, phone = '') =>
  svc.register({ uid, email, email_verified: true }, { firstName, lastName, phone, kvkk: true });

await reg('demo-katilimci', 'katilimci.demo@gmail.com', 'Ayşe', 'Demir', '05320000001');
await reg('demo-gorevli', 'gorevli.demo@gmail.com', 'Görevli', 'Hesap');
await reg('demo-yonetici', 'yonetici.demo@gmail.com', 'Yönetici', 'Hesap');
for (const k of ['stand-gdg', 'stand-labirent', 'game-duello', 's01', 's03']) await svc.redeem('demo-katilimci', codeOf[k]);

// Sıralama dolu görünsün diye örnek katılımcılar
const people = [
  ['Zeynep', 'Arslan', 9], ['Mert', 'Kaya', 8], ['Elif', 'Şahin', 8], ['Ahmet', 'Yıldız', 7], ['Büşra', 'Tekin', 6],
  ['Caner', 'Koç', 5], ['Selin', 'Doğan', 5], ['Ömer', 'Faruk', 4], ['İrem', 'Güneş', 4], ['Yusuf', 'Kılıç', 3],
  ['Nazlı', 'Öztürk', 3], ['Emre', 'Bulut', 2], ['Hilal', 'Kara', 2], ['Barış', 'Çelik', 1], ['Ecem', 'Uçar', 1],
];
const order = Object.keys(codeOf);
for (const [i, [f, l, n]] of people.entries()) {
  const uid = `demo-ornek-${i}`;
  await reg(uid, `ornek${i}@gmail.com`, f, l);
  for (let k = 0; k < n; k++) await svc.redeem(uid, codeOf[order[k]]);
}

// Oturum çekilişi de denenebilsin: örnek katılımcılar farklı sayıda oturuma katılmış olsun
// (her saat diliminden yalnızca biri, aynı anda iki oturum çakışması olmasın)
const sessionPerSlot = ['s01', 's02', 's04', 's06', 's08', 's10'];
for (let i = 0; i < people.length; i++) {
  for (const sid of sessionPerSlot.slice(0, i % (sessionPerSlot.length + 1))) await svc.redeem(`demo-ornek-${i}`, codeOf[sid]);
}

/* ---------- Başlat ---------- */
const port = Number(process.env.PORT) || 8080;
createApp().listen(port, () => {
  const rot = cfg.tasks.filter((t) => t.type === 'rotating');
  console.log(`\n  DEMO API http://localhost:${port}  (veriler bellekte, kapatınca sıfırlanır)\n`);
  console.log('  Test kodları:');
  for (const [task, label, code] of rows) console.log(`    ${code}  ${task.padEnd(18)} ${label}`);
  console.log(`\n  Saatlik kodlar (${rot.map((t) => t.name).join(', ')}) için Görevli hesabıyla giriş yapıp Görevli sekmesine bak.`);
  console.log('  Çakışma denemesi: Ayşe 10:00’da Salon 2’de (300003); 300002 girersen "Aynı anda 2 oturum" hatası alırsın.');
  console.log('  Çekiliş: yonetici.demo@gmail.com ile giriş yap → Yönetim sekmesi ya da tam ekran sahne http://localhost:5173/#cekilis\n');
});
