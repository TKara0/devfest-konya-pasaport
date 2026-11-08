import { useEffect, useState } from 'react';
import { istanbulClock, toMinutes, type Clock } from './now';

/** Yalnızca geliştirmede (`vite` sunucusu): `?saat=10:40` "şu an"ı etkinlik gününün o saatine alır. Yayın derlemesinde elenir. */
function devClock(date?: string): Clock | null {
  if (!import.meta.env.DEV || !date) return null;
  const t = new URLSearchParams(window.location.search).get('saat') ?? '';
  return /^([01]?\d|2[0-3]):[0-5]\d$/.test(t) ? { date, minutes: toMinutes(t.padStart(5, '0')) } : null;
}

/** İstanbul saati; 30 sn'de bir ve uyku/arka plandan dönünce tazelenir. */
export function useClock(eventDate?: string): Clock {
  const [ms, setMs] = useState(() => Date.now());
  useEffect(() => {
    const tick = () => setMs(Date.now());
    const timer = window.setInterval(tick, 30_000);
    const visible = () => document.visibilityState === 'visible' && tick();
    document.addEventListener('visibilitychange', visible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', visible);
    };
  }, []);
  return devClock(eventDate) ?? istanbulClock(ms);
}
