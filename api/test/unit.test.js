import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rotatingCode, matchRotating, currentRotating, GRACE_SECONDS } from '../src/codes.js';
import { normalizePhone, validateRegistration, displayName, isAllowedEmail } from '../src/validate.js';

const SECRET = 'test-secret-1234567890';
const task = { id: 'linkedin', name: 'LinkedIn', type: 'rotating', rotateMinutes: 60 };
const HOUR = 3600_000;
const base = 1_800_000 * HOUR; // tam saat başı

test('dönen kod deterministik ve 6 hane', () => {
  const a = rotatingCode(SECRET, 'linkedin', 42);
  assert.match(a, /^\d{6}$/);
  assert.equal(a, rotatingCode(SECRET, 'linkedin', 42));
  assert.notEqual(a, rotatingCode(SECRET, 'instagram', 42));
});

test('bu saatin kodu kabul edilir', () => {
  const now = base + 20 * 60_000;
  const { code } = currentRotating(SECRET, task, now);
  assert.equal(matchRotating(SECRET, [task], code, now).status, 'ok');
});

test('önceki saatin kodu tolerans içinde kabul, sonra süresi dolmuş', () => {
  const prevCode = currentRotating(SECRET, task, base - 60_000).code;
  assert.equal(matchRotating(SECRET, [task], prevCode, base + (GRACE_SECONDS - 10) * 1000).status, 'ok');
  assert.equal(matchRotating(SECRET, [task], prevCode, base + (GRACE_SECONDS + 10) * 1000).status, 'expired');
});

test('iki saat önceki kod süresi dolmuş sayılır', () => {
  const old = currentRotating(SECRET, task, base - 2 * HOUR + 60_000).code;
  assert.equal(matchRotating(SECRET, [task], old, base + 30 * 60_000).status, 'expired');
});

test('kalan süre doğru hesaplanır', () => {
  const r = currentRotating(SECRET, task, base + 15 * 60_000);
  assert.equal(r.secondsLeft, 45 * 60);
});

test('telefon normalizasyonu', () => {
  assert.equal(normalizePhone('0532 123 45 67'), '05321234567');
  assert.equal(normalizePhone('5321234567'), '05321234567');
  assert.equal(normalizePhone('+90 532 123 45 67'), '05321234567');
  assert.equal(normalizePhone('0212 123 45 67'), null);
  assert.equal(normalizePhone('123'), null);
});

test('kayıt doğrulaması: telefon isteğe bağlı', () => {
  const ok = validateRegistration({ firstName: ' Talha ', lastName: 'Kara', phone: '05321234567', kvkk: true });
  assert.deepEqual(ok, { firstName: 'Talha', lastName: 'Kara', phone: '05321234567' });
  assert.equal(validateRegistration({ firstName: 'A', lastName: 'B', phone: '  ', kvkk: true }).phone, null);
  assert.equal(validateRegistration({ firstName: 'A', lastName: 'B', kvkk: true }).phone, null);
  assert.throws(() => validateRegistration({ firstName: 'A', lastName: 'B', phone: '123', kvkk: true }), /boş bırak/);
  assert.throws(() => validateRegistration({ ...ok, kvkk: false }), /aydınlatma/);
  assert.throws(() => validateRegistration({ firstName: '', lastName: 'B', kvkk: true }), /Ad ve soyad/);
});

test('yalnızca kişisel Gmail', () => {
  assert.equal(isAllowedEmail('ali@gmail.com'), true);
  assert.equal(isAllowedEmail('Ali@GoogleMail.com'), true);
  assert.equal(isAllowedEmail('203301001@ogr.selcuk.edu.tr'), false);
  assert.equal(isAllowedEmail('ali@hotmail.com'), false);
  assert.equal(isAllowedEmail(''), false);
});

test('sıralamada soyadın baş harfi', () => {
  assert.equal(displayName({ firstName: 'Zeynep', lastName: 'ılgaz' }), 'Zeynep I.');
  assert.equal(displayName({ firstName: 'Ece', lastName: 'işık' }), 'Ece İ.');
});
