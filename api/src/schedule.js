/**
 * Etkinlik akışı doğrulaması: salonlar (tam 2), oturumların `slot`/`end` saatleri ve oturum olmayan
 * `agenda` maddeleri. Saf fonksiyon; seed betiği ve testler kullanır. Hata → Error (Türkçe mesaj).
 *
 * `slot` oturumun başlangıç saatidir (paralel oturum kuralı buna bağlı). `hall: null` = "Tüm alan":
 * iki salonu birden kaplar, yani iki salondan herhangi biriyle zaman çakışamaz.
 */

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const ID_RE = /^[a-z0-9-]+$/;

export const toMinutes = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));

export function validateSchedule(cfg) {
  const halls = cfg.halls;
  if (!Array.isArray(halls) || halls.length !== 2) throw new Error('halls: tam olarak 2 salon tanımlanmalı');
  const hallIds = new Set();
  for (const h of halls) {
    if (!h || !ID_RE.test(h.id || '')) throw new Error(`halls: geçersiz salon id: ${h?.id}`);
    if (hallIds.has(h.id)) throw new Error(`halls: tekrarlanan salon id: ${h.id}`);
    if (!String(h.name || '').trim()) throw new Error(`halls: ${h.id} için ad yazılmalı`);
    hallIds.add(h.id);
  }

  const items = [];
  const seen = new Set();
  const add = (kind, it, start) => {
    const label = `${kind} ${it.id}`;
    if (!it.id || seen.has(it.id)) throw new Error(`${label}: id eksik ya da tekrarlı`);
    seen.add(it.id);
    if (!TIME_RE.test(start || '')) throw new Error(`${label}: başlangıç SS:DD biçiminde olmalı (ör. 10:00)`);
    if (!TIME_RE.test(it.end || '')) throw new Error(`${label}: end SS:DD biçiminde olmalı (ör. 10:45)`);
    if (toMinutes(it.end) <= toMinutes(start)) throw new Error(`${label}: end (${it.end}) başlangıçtan (${start}) sonra olmalı`);
    const hall = it.hall ?? null;
    if (hall !== null && !hallIds.has(hall)) throw new Error(`${label}: bilinmeyen salon "${hall}" (halls: ${[...hallIds].join(', ')})`);
    if (kind === 'oturum' && hall === null) throw new Error(`${label}: oturumun salonu belli olmalı`);
    if (kind === 'agenda' && !String(it.title || '').trim()) throw new Error(`${label}: title boş olamaz`);
    items.push({ label, hall, start: toMinutes(start), end: toMinutes(it.end), text: `${start}-${it.end}` });
  };
  for (const s of cfg.sessions || []) add('oturum', s, s.slot);
  for (const a of cfg.agenda || []) add('agenda', a, a.start);

  // Aynı salonda çakışma yok; "Tüm alan" (null) iki salonu da kaplar. Uç uca gelmek çakışma sayılmaz.
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i];
      const b = items[j];
      const sameHall = a.hall === null || b.hall === null || a.hall === b.hall;
      if (sameHall && a.start < b.end && b.start < a.end) {
        throw new Error(`zaman çakışması: ${a.label} (${a.text}) ile ${b.label} (${b.text})${a.hall && a.hall === b.hall ? ` aynı salonda (${a.hall})` : ''}`);
      }
    }
  }
}
