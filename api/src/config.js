import { db } from './firebase.js';
import { ApiError } from './validate.js';

const CONFIG_TTL = 30_000;
const ROLE_TTL = 60_000;

let cfgCache = { at: 0, value: null };
const roleCache = new Map();

/**
 * Etkinlik yapılandırması (görevler, adımlar, salonlar, oturumlar, akış maddeleri, çekiliş kategorileri). Kodlar burada YOK;
 * onlar ayrı `codes` koleksiyonunda durur. `npm run seed` ile yazılır.
 */
export async function getConfig() {
  if (cfgCache.value && Date.now() - cfgCache.at < CONFIG_TTL) return cfgCache.value;
  const snap = await db.doc('config/event').get();
  if (!snap.exists) throw new ApiError(503, 'NOT_CONFIGURED', 'Etkinlik henüz yapılandırılmadı. Yönetici `npm run seed` çalıştırmalı.');
  const raw = snap.data();
  const slots = [...new Set((raw.sessions || []).map((s) => s.slot))].sort();
  const tasks = (raw.tasks || []).map((t) => ({
    ...t,
    total: t.type === 'session' ? slots.length : t.type === 'rotating' ? 1 : (t.steps || []).length,
  }));
  cfgCache = { at: Date.now(), value: { event: raw.event || {}, tasks, halls: raw.halls || [], sessions: raw.sessions || [], agenda: raw.agenda || [], slots, raffles: raw.raffles || [] } };
  return cfgCache.value;
}

/** İstemciye giden, kod içermeyen yapılandırma. */
export async function publicConfig() {
  const c = await getConfig();
  return {
    event: c.event,
    tasks: c.tasks.map(({ id, name, desc, icon, type, reward, rewardLabel, rotateMinutes, total, steps }) => ({
      id, name, desc, icon, type, reward, rewardLabel, rotateMinutes, total,
      steps: type === 'static' ? (steps || []).map(({ id: sid, label }) => ({ id: sid, label })) : [],
    })),
    halls: c.halls.map(({ id, name }) => ({ id, name })),
    sessions: c.sessions.map(({ id, slot, end, hall, title, speaker, tag }) => ({ id, slot, end, hall, title, speaker, tag })),
    agenda: c.agenda.map(({ id, start, end, hall, title, note }) => ({ id, start, end, hall: hall ?? null, title, note })),
  };
}

export async function roleOf(email) {
  if (!email) return null;
  const key = email.toLowerCase();
  const hit = roleCache.get(key);
  if (hit && Date.now() - hit.at < ROLE_TTL) return hit.role;
  const snap = await db.doc(`roles/${key}`).get();
  const role = snap.exists ? snap.data().role : null;
  roleCache.set(key, { at: Date.now(), role });
  return role;
}

export function clearCaches() {
  cfgCache = { at: 0, value: null };
  roleCache.clear();
}
