/**
 * Etkinlik yapılandırmasını Firestore'a yazar ve sabit kodları üretir.
 *
 *   npm run seed                 → seed/event.json (yoksa event.example.json)
 *   npm run seed -- dosya.json   → belirtilen dosya
 *
 * Tekrar çalıştırmak güvenlidir: daha önce üretilmiş kodlar KORUNUR
 * (basılmış stant kartları geçersiz olmaz). Yalnızca yeni adım/oturumlara
 * kod üretilir, silinen adımların kodları kaldırılır.
 * Çıktı: seed/codes-print.csv (baskıya gidecek kod listesi, repoya girmez).
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { randomInt } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { db } from '../src/firebase.js';
import { validateRaffles } from '../src/raffle.js';
import { validateSchedule } from '../src/schedule.js';

const here = dirname(fileURLToPath(import.meta.url));
const seedDir = join(here, '..', 'seed');
const argPath = process.argv[2];
const path = argPath || (existsSync(join(seedDir, 'event.json')) ? join(seedDir, 'event.json') : join(seedDir, 'event.example.json'));
if (!argPath && path.endsWith('event.example.json')) {
  console.warn('⚠  seed/event.json bulunamadı, örnek dosya kullanılıyor.');
}
const cfg = JSON.parse(readFileSync(path, 'utf8'));

/* ---------- doğrulama ---------- */
const fail = (m) => { console.error('✗ ' + m); process.exit(1); };
const ids = new Set();
const TYPES = ['static', 'session', 'rotating'];
for (const t of cfg.tasks || []) {
  if (!t.id || !/^[a-z0-9-]+$/.test(t.id)) fail(`Geçersiz görev id: ${t.id}`);
  if (ids.has(t.id)) fail(`Tekrarlanan id: ${t.id}`);
  ids.add(t.id);
  if (!TYPES.includes(t.type)) fail(`${t.id}: type ${TYPES.join('/')} olmalı`);
  if (!(Number(t.reward) > 0)) fail(`${t.id}: reward pozitif sayı olmalı`);
  if (t.type === 'static') {
    if (!t.steps?.length) fail(`${t.id}: static görevin en az bir adımı olmalı`);
    for (const s of t.steps) {
      if (!s.id || ids.has(s.id)) fail(`${t.id}: adım id eksik ya da tekrarlı (${s.id})`);
      ids.add(s.id);
    }
  }
}
const sessionTasks = (cfg.tasks || []).filter((t) => t.type === 'session');
if (sessionTasks.length > 1) fail('Yalnızca bir adet session tipinde görev olabilir.');
for (const s of cfg.sessions || []) {
  if (!s.id || ids.has(s.id)) fail(`Oturum id eksik ya da tekrarlı: ${s.id}`);
  ids.add(s.id);
  if (!/^\d{2}:\d{2}$/.test(s.slot)) fail(`${s.id}: slot SS:DD biçiminde olmalı (ör. 10:00)`);
}
if ((cfg.sessions || []).length && !sessionTasks.length) fail('Oturum var ama session tipinde görev yok.');
try {
  validateRaffles(cfg.raffles, cfg.tasks);
} catch (e) {
  fail(`raffles: ${e.message}`);
}
try {
  validateSchedule(cfg);
} catch (e) {
  fail(`akış: ${e.message}`);
}
// agenda maddesi kod almaz ama id'si görev/adım/oturum id'leriyle karışmasın
for (const a of cfg.agenda || []) {
  if (ids.has(a.id)) fail(`Tekrarlanan id: ${a.id}`);
}

/* ---------- kodlar ---------- */
const existing = await db.collection('codes').get();
const codeByKey = new Map(); // stepId|sessionId → code
const used = new Set();
for (const d of existing.docs) {
  const k = d.data().stepId || d.data().sessionId;
  codeByKey.set(k, d.id);
  used.add(d.id);
}

const weak = (c) => /^(\d)\1{5}$/.test(c) || '0123456789'.includes(c) || '9876543210'.includes(c);
function newCode() {
  for (;;) {
    const c = String(randomInt(0, 1_000_000)).padStart(6, '0');
    if (!used.has(c) && !weak(c)) { used.add(c); return c; }
  }
}

const wanted = []; // {code, data}
for (const t of cfg.tasks) {
  if (t.type !== 'static') continue;
  for (const s of t.steps) {
    const code = codeByKey.get(s.id) || newCode();
    wanted.push({ code, data: { kind: 'step', taskId: t.id, stepId: s.id, label: s.label } });
  }
}
const sessionTask = sessionTasks[0];
for (const s of cfg.sessions || []) {
  const code = codeByKey.get(s.id) || newCode();
  wanted.push({ code, data: { kind: 'session', taskId: sessionTask.id, sessionId: s.id, slot: s.slot, label: s.title } });
}
const wantedCodes = new Set(wanted.map((w) => w.code));
const stale = existing.docs.filter((d) => !wantedCodes.has(d.id));

/* ---------- yaz ---------- */
const ops = [];
ops.push((b) => b.set(db.doc('config/event'), { event: cfg.event || {}, tasks: cfg.tasks, halls: cfg.halls, sessions: cfg.sessions || [], agenda: cfg.agenda || [], raffles: cfg.raffles || [], updatedAt: Date.now() }));
for (const w of wanted) ops.push((b) => b.set(db.doc(`codes/${w.code}`), w.data));
for (const d of stale) ops.push((b) => b.delete(d.ref));

const roles = new Map();
for (const e of cfg.roles?.staff || []) roles.set(e.toLowerCase(), 'staff');
for (const e of cfg.roles?.admins || []) roles.set(e.toLowerCase(), 'admin');
const oldRoles = await db.collection('roles').get();
for (const d of oldRoles.docs) if (!roles.has(d.id)) ops.push((b) => b.delete(d.ref));
for (const [email, role] of roles) ops.push((b) => b.set(db.doc(`roles/${email}`), { role }));

for (let i = 0; i < ops.length; i += 400) {
  const batch = db.batch();
  ops.slice(i, i + 400).forEach((op) => op(batch));
  await batch.commit();
}

/* ---------- baskı listesi ---------- */
const rows = [['Görev', 'Ad', 'Saat', 'Salon', 'Kod']];
for (const w of wanted) {
  const d = w.data;
  const task = cfg.tasks.find((t) => t.id === d.taskId);
  const sess = d.kind === 'session' ? cfg.sessions.find((s) => s.id === d.sessionId) : null;
  rows.push([task.name, d.label, sess?.slot || '', cfg.halls.find((h) => h.id === sess?.hall)?.name || '', w.code]);
}
const csv = '﻿' + rows.map((r) => r.map((v) => (/[",]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)).join(',')).join('\r\n');
writeFileSync(join(seedDir, 'codes-print.csv'), csv);

const fresh = wanted.filter((w) => !codeByKey.has(w.data.stepId || w.data.sessionId)).length;
console.log(`✓ ${cfg.tasks.length} görev, ${(cfg.sessions || []).length} oturum, ${(cfg.agenda || []).length} akış maddesi, 2 salon yazıldı.`);
console.log(`✓ ${wanted.length} sabit kod (${fresh} yeni, ${wanted.length - fresh} korundu), ${stale.length} eski kod silindi.`);
console.log(`✓ ${(cfg.raffles || []).length} çekiliş kategorisi.`);
console.log(`✓ ${roles.size} görevli/yönetici rolü.`);
console.log(`→ Baskı listesi: seed/codes-print.csv`);
process.exit(0);
