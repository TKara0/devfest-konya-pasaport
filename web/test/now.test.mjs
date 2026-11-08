/**
 * "Şu an" hesabının (src/now.ts) testi. Çalıştırma: cd web && npm test
 * Node, .ts dosyasını doğrudan yükler (--experimental-strip-types); ek bağımlılık yok.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { istanbulClock, flowItems, nowState, statusOf, leftLabel, atTime, dayLabel, toMinutes } from '../src/now.ts';

// Sabit test akışı (test/fixtures/flow.json): gerçek akış değiştikçe testler bozulmasın diye ayrı tutulur.
const example = JSON.parse(readFileSync(new URL('./fixtures/flow.json', import.meta.url), 'utf8'));
const cfg = { event: example.event, halls: example.halls, sessions: example.sessions, agenda: example.agenda };
// Test akışı: 08:30 kayıt (tüm alan) · 09:00 s01 (Salon 1) · 10:00 s02|s03 · 10:45 kahve (tüm alan) · 11:00 s04|s05
//             12:00 öğle (tüm alan) · 13:30 s06|s07 … 15:30 s10|s11 (16:15) · 16:30–17:15 Salon 1 çekiliş ve kapanış
const at = (hhmm, date = '2026-11-21') => ({ date, minutes: toMinutes(hhmm) });
const ids = (s) => s.halls.map((h) => h.current?.id ?? null);
const nexts = (s) => s.halls.map((h) => h.next?.id ?? null);

test('İstanbul saati: cihaz saat diliminden bağımsız', () => {
  const ms = Date.UTC(2026, 10, 21, 7, 40); // 10:40 İstanbul (UTC+3)
  const saved = process.env.TZ;
  try {
    for (const tz of ['UTC', 'America/Los_Angeles', 'Pacific/Auckland', 'Asia/Tokyo', 'Europe/Istanbul']) {
      process.env.TZ = tz;
      assert.deepEqual(istanbulClock(ms), { date: '2026-11-21', minutes: 10 * 60 + 40 }, tz);
    }
  } finally {
    if (saved === undefined) delete process.env.TZ;
    else process.env.TZ = saved;
  }
});

test('gece yarısı: İstanbul tarihi UTC tarihinden farklı olabilir', () => {
  // 20 Kasım 21:30 UTC = 21 Kasım 00:30 İstanbul (UTC'de hâlâ 20'si)
  assert.deepEqual(istanbulClock(Date.UTC(2026, 10, 20, 21, 30)), { date: '2026-11-21', minutes: 30 });
  // 20 Kasım 20:59 UTC = 20 Kasım 23:59 İstanbul
  assert.deepEqual(istanbulClock(Date.UTC(2026, 10, 20, 20, 59)), { date: '2026-11-20', minutes: 23 * 60 + 59 });
  // 21 Kasım 21:00 UTC = 22 Kasım 00:00 İstanbul ("24:00" değil)
  assert.deepEqual(istanbulClock(Date.UTC(2026, 10, 21, 21, 0)), { date: '2026-11-22', minutes: 0 });

  assert.equal(nowState(cfg, istanbulClock(Date.UTC(2026, 10, 20, 21, 30))).phase, 'before', '21 Kasım 00:30: gün başladı ama etkinlik değil');
  assert.equal(nowState(cfg, istanbulClock(Date.UTC(2026, 10, 21, 21, 30))).phase, 'after', 'UTC\'de hâlâ 21\'i, İstanbul\'da 22 Kasım 00:30');
  assert.equal(nowState(cfg, istanbulClock(Date.UTC(2026, 10, 21, 7, 40))).phase, 'live');
});

test('başlamadan önce: başlangıç saati ve ilk maddeler', () => {
  for (const clock of [at('08:00'), at('00:00'), at('12:00', '2026-11-20'), at('23:59', '2026-11-01')]) {
    const s = nowState(cfg, clock);
    assert.equal(s.phase, 'before');
    assert.equal(s.startsAt, '08:30');
    assert.deepEqual(s.first.map((i) => i.id), ['a01', 's01', 's02']);
  }
  assert.equal(nowState(cfg, at('08:29')).phase, 'before');
  assert.equal(nowState(cfg, at('08:30')).phase, 'live', 'ilk madde başlayınca etkinlik başlamıştır');
});

test('iki salonda farklı oturum: şu an, kalan dakika ve sıradaki', () => {
  const s = nowState(cfg, at('10:40'));
  assert.equal(s.phase, 'live');
  assert.equal(s.common, null);
  assert.deepEqual(ids(s), ['s02', 's03']);
  assert.deepEqual(s.halls.map((h) => h.minutesLeft), [5, 5]);
  assert.deepEqual(nexts(s), ['a02', 'a02'], 'sıradaki: 10:45 kahve arası (tüm alan) her iki salonda');

  const t = nowState(cfg, at('11:10'));
  assert.deepEqual(ids(t), ['s04', 's05']);
  assert.deepEqual(t.halls.map((h) => h.minutesLeft), [35, 35]);
  assert.deepEqual(nexts(t), ['a03', 'a03']);
  assert.deepEqual(s.halls.map((h) => h.hall.id), ['salon-1', 'salon-2']);
});

test('madde başlangıcı dahil, bitişi hariç', () => {
  assert.deepEqual(ids(nowState(cfg, at('10:00'))), ['s02', 's03']);
  assert.deepEqual(ids(nowState(cfg, at('10:44'))), ['s02', 's03']);
  const e = nowState(cfg, at('10:45'));
  assert.equal(e.common.id, 'a02', '10:45\'te oturum biter, kahve arası başlar');
  assert.deepEqual(ids(e), [null, null]);
});

test('bir salon boş: boş salon + sıradaki', () => {
  const a = nowState(cfg, at('09:30'));
  assert.deepEqual(ids(a), ['s01', null], 'Salon 2 09:30\'da boş');
  assert.deepEqual(nexts(a), ['s02', 's03']);
  const b = nowState(cfg, at('09:55')); // oturumlar arası boşluk
  assert.deepEqual(ids(b), [null, null]);
  assert.equal(b.common, null);
  assert.deepEqual(nexts(b), ['s02', 's03']);
});

test('tüm alan maddesi: tek şerit, salonlar boş, sıradaki oturumlar', () => {
  const s = nowState(cfg, at('12:45'));
  assert.equal(s.phase, 'live');
  assert.equal(s.common.id, 'a03');
  assert.equal(s.common.title, 'Öğle arası');
  assert.equal(s.commonMinutesLeft, 45);
  assert.deepEqual(ids(s), [null, null]);
  assert.deepEqual(nexts(s), ['s06', 's07']);
  assert.equal(nowState(cfg, at('08:45')).common.id, 'a01', 'kayıt tüm alan');
});

test('salona özel agenda maddesi ve etkinliğin sonu', () => {
  const s = nowState(cfg, at('16:45'));
  assert.deepEqual(ids(s), ['a04', null], 'çekiliş ve kapanış yalnızca Salon 1\'de');
  assert.deepEqual(nexts(s), [null, null]);
  assert.equal(s.halls[0].minutesLeft, 30);
  assert.equal(nowState(cfg, at('17:14')).phase, 'live');
  assert.equal(nowState(cfg, at('17:15')).phase, 'after', 'son madde bitince etkinlik biter');
  assert.equal(nowState(cfg, at('19:00')).phase, 'after');
  assert.equal(nowState(cfg, at('10:00', '2026-11-22')).phase, 'after', 'ertesi gün');
  assert.equal(nowState(cfg, at('12:00', '2027-01-01')).phase, 'after');
});

test('akış ya da salon yoksa kart gösterilmez; tarih yoksa yalnızca saate bakılır', () => {
  assert.equal(nowState({ ...cfg, sessions: [], agenda: [] }, at('10:00')).phase, 'none');
  assert.equal(nowState({ ...cfg, halls: [] }, at('10:00')).phase, 'none');
  const noDate = { ...cfg, event: {} };
  assert.equal(nowState(noDate, at('10:40', '2030-05-05')).phase, 'live');
  assert.equal(nowState(noDate, at('07:00', '2030-05-05')).phase, 'before');
});

test('eski seed: end alanı olmayan oturum asla "şu an" sayılmaz, çökmez', () => {
  const old = { event: {}, halls: cfg.halls, agenda: [], sessions: [{ id: 'x', slot: '10:00', hall: 'salon-1', title: 'X' }] };
  assert.doesNotThrow(() => nowState(old, at('10:00')));
  assert.equal(statusOf(flowItems(old)[0], at('10:00')), 'past');
});

test('liste sırası: başlangıç, sonra tüm alan, sonra salon sırası', () => {
  const list = flowItems(cfg).map((i) => i.id);
  assert.deepEqual(list, ['a01', 's01', 's02', 's03', 'a02', 's04', 's05', 'a03', 's06', 's07', 's08', 's09', 's10', 's11', 'a04']);
});

test('madde durumu: geçmiş / süren / gelecek', () => {
  const s02 = flowItems(cfg).find((i) => i.id === 's02');
  assert.equal(statusOf(s02, at('09:59'), '2026-11-21'), 'upcoming');
  assert.equal(statusOf(s02, at('10:00'), '2026-11-21'), 'live');
  assert.equal(statusOf(s02, at('10:45'), '2026-11-21'), 'past');
  assert.equal(statusOf(s02, at('10:10', '2026-11-20'), '2026-11-21'), 'upcoming', 'etkinlik günü değil');
  assert.equal(statusOf(s02, at('10:10', '2026-11-22'), '2026-11-21'), 'past');
});

test('metin yardımcıları', () => {
  assert.equal(leftLabel(5), '5 dk');
  assert.equal(leftLabel(60), '1 sa');
  assert.equal(leftLabel(95), '1 sa 35 dk');
  const cases = { '09:00': "09:00'da", '10:00': "10:00'da", '11:00': "11:00'de", '12:00': "12:00'de", '13:00': "13:00'te", '14:30': "14:30'da", '15:00': "15:00'te", '16:00': "16:00'da", '17:00': "17:00'de", '18:00': "18:00'de", '19:00': "19:00'da", '20:00': "20:00'de", '08:40': "08:40'ta", '09:15': "09:15'te", '09:50': "09:50'de", '10:20': "10:20'de" };
  for (const [t, want] of Object.entries(cases)) assert.equal(atTime(t), want);
  assert.equal(dayLabel('2026-11-21'), '21 Kasım');
});

test('gerçek akış (api/seed/event.example.json): öğle arasında tek şerit, 17:00 bitti', () => {
  const real = JSON.parse(readFileSync(new URL('../../api/seed/event.example.json', import.meta.url), 'utf8'));
  const rcfg = { event: real.event, halls: real.halls, sessions: real.sessions, agenda: real.agenda };
  assert.equal(nowState(rcfg, at('09:30')).phase, 'before');
  const lunch = nowState(rcfg, at('13:00'));
  assert.equal(lunch.phase, 'live');
  assert.equal(lunch.common?.title, 'Öğle Arası');
  const s1050 = nowState(rcfg, at('10:50'));
  assert.equal(s1050.halls[0].current?.id, 's02');
  assert.equal(s1050.halls[1].current, null, 'Slytherin 10:45-11:15 arası boş');
  assert.equal(nowState(rcfg, at('17:00')).phase, 'after');
});
