import { createHmac } from 'node:crypto';

/** Saatlik (dönen) kodun süresi geçtikten sonra eski kodun kabul edildiği tolerans. */
export const GRACE_SECONDS = 180;

/** Görevin kod değişim periyodu (saniye). Varsayılan 60 dk. */
export function periodOf(task) {
  return Math.max(5, Number(task.rotateMinutes) || 60) * 60;
}

/**
 * Bir dönen görevin belirli bir zaman dilimindeki kodu.
 * Kod tamamen HMAC ile hesaplanır, veritabanına yazılmaz.
 */
export function rotatingCode(secret, taskId, bucket) {
  const mac = createHmac('sha256', secret).update(`${taskId}:${bucket}`).digest();
  return String(mac.readUInt32BE(0) % 1_000_000).padStart(6, '0');
}

export function bucketAt(task, nowMs) {
  return Math.floor(nowMs / 1000 / periodOf(task));
}

/**
 * Girilen kodu dönen görevlere karşı kontrol eder.
 * @returns {{status:'ok'|'expired', task:object} | null}
 */
export function matchRotating(secret, tasks, code, nowMs = Date.now()) {
  for (const task of tasks) {
    if (task.type !== 'rotating') continue;
    const period = periodOf(task);
    const bucket = bucketAt(task, nowMs);
    const intoPeriod = (nowMs / 1000) % period;

    if (code === rotatingCode(secret, task.id, bucket)) return { status: 'ok', task };
    const prev = rotatingCode(secret, task.id, bucket - 1);
    if (code === prev) return { status: intoPeriod < GRACE_SECONDS ? 'ok' : 'expired', task };
    for (let back = 2; back <= 6; back++) {
      if (code === rotatingCode(secret, task.id, bucket - back)) return { status: 'expired', task };
    }
  }
  return null;
}

/** Görevli ekranı için: şu anki kod, kalan süre, bir önceki kod. */
export function currentRotating(secret, task, nowMs = Date.now()) {
  const period = periodOf(task);
  const bucket = bucketAt(task, nowMs);
  const elapsed = (nowMs / 1000) % period;
  return {
    taskId: task.id,
    name: task.name,
    code: rotatingCode(secret, task.id, bucket),
    previous: rotatingCode(secret, task.id, bucket - 1),
    periodSeconds: period,
    secondsLeft: Math.ceil(period - elapsed),
  };
}

export const CODE_RE = /^\d{6}$/;
