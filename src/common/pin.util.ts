import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';

export function hashPin(pin: string, salt = randomBytes(16).toString('hex')) {
  const hash = scryptSync(pin, salt, 32).toString('hex');
  return { hash, salt };
}

export function verifyPin(pin: string, hash: string, salt: string): boolean {
  const candidate = scryptSync(pin, salt, 32);
  const stored = Buffer.from(hash, 'hex');
  return candidate.length === stored.length && timingSafeEqual(candidate, stored);
}