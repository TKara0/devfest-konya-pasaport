import type { EventConfig, Hall } from './types';

/**
 * "Şu an" hesabı: saf fonksiyonlar, React ve tarayıcıya bağlı değil (web/test/now.test.mjs ile sınanır).
 * Saat her zaman Europe/Istanbul'a göre okunur; cihazın saat dilimi önemli değildir.
 */

export const TZ = 'Europe/Istanbul';

/** İstanbul duvar saati: tarih ("2026-11-21") ve gün başından geçen dakika. */
export interface Clock {
  date: string;
  minutes: number;
}

const parts = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

export function istanbulClock(ms: number): Clock {
  const p: Record<string, string> = {};
  for (const x of parts.formatToParts(ms)) p[x.type] = x.value;
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute) };
}

export const toMinutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
export const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/** Akıştaki tek madde: oturum ya da oturum olmayan (agenda) madde. hall null = tüm alan. */
export interface FlowItem {
  id: string;
  kind: 'session' | 'agenda';
  start: string;
  end: string;
  startMin: number;
  endMin: number;
  hall: string | null;
  title: string;
  speaker?: string;
  note?: string;
}

type FlowConfig = Pick<EventConfig, 'halls' | 'sessions' | 'agenda'>;

/** Oturumlar + agenda maddeleri: başlangıca göre, aynı anda tüm alan önce, sonra salon sırasıyla. */
export function flowItems(c: FlowConfig): FlowItem[] {
  const items: FlowItem[] = [];
  for (const s of c.sessions) {
    // eski seed'lerde end yoktur: bitişi başlangıca eşitle (hiçbir zaman "şu an" sayılmaz)
    const end = s.end ?? s.slot;
    items.push({ id: s.id, kind: 'session', start: s.slot, end, startMin: toMinutes(s.slot), endMin: toMinutes(end), hall: s.hall, title: s.title, speaker: s.speaker });
  }
  for (const a of c.agenda) {
    items.push({ id: a.id, kind: 'agenda', start: a.start, end: a.end, startMin: toMinutes(a.start), endMin: toMinutes(a.end), hall: a.hall, title: a.title, note: a.note });
  }
  const order = (h: string | null) => (h === null ? -1 : c.halls.findIndex((x) => x.id === h));
  return items.sort((a, b) => a.startMin - b.startMin || order(a.hall) - order(b.hall) || a.endMin - b.endMin);
}

export type Status = 'past' | 'live' | 'upcoming';

/** Maddenin etkinlik gününe ve saate göre durumu. Etkinlik günü değilse tarih belirler. */
export function statusOf(item: Pick<FlowItem, 'startMin' | 'endMin'>, clock: Clock, eventDate?: string): Status {
  if (eventDate) {
    if (clock.date < eventDate) return 'upcoming';
    if (clock.date > eventDate) return 'past';
  }
  if (clock.minutes >= item.endMin) return 'past';
  if (clock.minutes >= item.startMin) return 'live';
  return 'upcoming';
}

export interface HallNow {
  hall: Hall;
  /** salonda şu an süren madde (yoksa salon boştur) */
  current: FlowItem | null;
  minutesLeft: number;
  /** salonda ya da tüm alanda başlayacak ilk madde */
  next: FlowItem | null;
}

export type NowState =
  | { phase: 'none' }
  | { phase: 'before'; startsAt: string; first: FlowItem[] }
  | { phase: 'live'; common: FlowItem | null; commonMinutesLeft: number; halls: HallNow[] }
  | { phase: 'after' };

/** "Şu an" kartının durumu. Akış ya da salon yoksa 'none' (kart gösterilmez). */
export function nowState(c: Pick<EventConfig, 'event' | 'halls' | 'sessions' | 'agenda'>, clock: Clock): NowState {
  const items = flowItems(c);
  if (!items.length || !c.halls.length) return { phase: 'none' };

  const firstStart = Math.min(...items.map((i) => i.startMin));
  const lastEnd = Math.max(...items.map((i) => i.endMin));
  const date = c.event.date;
  const first = items.find((i) => i.startMin === firstStart)!;

  const before = { phase: 'before' as const, startsAt: first.start, first: items.slice(0, 3) };
  if (date && clock.date < date) return before;
  if (date && clock.date > date) return { phase: 'after' };
  if (clock.minutes < firstStart) return before;
  if (clock.minutes >= lastEnd) return { phase: 'after' };

  const m = clock.minutes;
  const active = items.filter((i) => i.startMin <= m && m < i.endMin);
  const common = active.find((i) => i.hall === null) ?? null;
  return {
    phase: 'live',
    common,
    commonMinutesLeft: common ? common.endMin - m : 0,
    halls: c.halls.map((hall) => {
      const current = active.find((i) => i.hall === hall.id) ?? null;
      const next = items.find((i) => i.startMin > m && (i.hall === hall.id || i.hall === null)) ?? null;
      return { hall, current, minutesLeft: current ? current.endMin - m : 0, next };
    }),
  };
}

/** "9 dk", "1 sa 5 dk", "2 sa" */
export function leftLabel(min: number): string {
  const h = Math.floor(min / 60);
  const r = min % 60;
  if (!h) return `${r} dk`;
  return r ? `${h} sa ${r} dk` : `${h} sa`;
}

/** "09:00" → "09:00'da", "11:00" → "11:00'de", "10:40" → "10:40'ta" (okunuşun son hecesine göre). */
export function atTime(t: string): string {
  const h = Number(t.slice(0, 2));
  const m = Number(t.slice(3, 5));
  const n = m || h; // dakika 0 ise son okunan sayı saattir
  const ones = n % 10;
  // yirmi/elli/yedi/sekiz/bir/iki/on bir… → de; üç/dört/beş/kırk → te/ta; dokuz/altı/otuz/on → da
  const byOnes: Record<number, string> = { 1: 'de', 2: 'de', 3: 'te', 4: 'te', 5: 'te', 6: 'da', 7: 'de', 8: 'de', 9: 'da' };
  const byTens: Record<number, string> = { 0: 'da', 1: 'da', 2: 'de', 3: 'da', 4: 'ta', 5: 'de' };
  const suffix = ones ? byOnes[ones] : byTens[Math.floor(n / 10) % 10];
  return `${t}'${suffix}`;
}

/** "2026-11-21" → "21 Kasım" */
export function dayLabel(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', timeZone: 'UTC' });
}
