import { afterEach, expect, test, vi } from 'vitest';
import { PasswordHasher } from '../../../workers/password-hasher/index';
import { hashCredential, verifyCredential, type PasswordHasherBinding } from './password-hasher';

const worker = new PasswordHasher();
const fetchJob = vi.fn((input: string, init: RequestInit) => worker.fetch(new Request(input, init)));
const binding: PasswordHasherBinding = { idFromName: name => name, get: () => ({ fetch: fetchJob }) };
afterEach(() => { vi.unstubAllEnvs(); fetchJob.mockClear(); });

test('production hashing uses the private binding and preserves bcrypt passwords and PINs', async () => {
  vi.stubEnv('NODE_ENV', 'production');
  const stored = await hashCredential('SharedDinner!123', binding);
  expect(stored).toMatch(/^\$2b\$12\$/);
  expect(await verifyCredential('SharedDinner!123', stored, binding)).toBe(true);
  expect(await verifyCredential('wrong', stored, binding)).toBe(false);
  expect(fetchJob).toHaveBeenCalledTimes(3);
});

test('production never falls back to CPU-heavy local hashing when the binding is missing', async () => {
  vi.stubEnv('NODE_ENV', 'production');
  await expect(hashCredential('SharedDinner!123')).rejects.toThrow('temporarily unavailable');
});

test('private worker bounds input and rejects malformed hashes or operations', async () => {
  expect(await verifyCredential('test', '$2b$31$' + 'a'.repeat(53), binding)).toBe(false);
  const invalid = await worker.fetch(new Request('https://internal', { method: 'POST', body: '{"operation":"unknown"}' }));
  expect(invalid.status).toBe(400);
  const oversized = await worker.fetch(new Request('https://internal', { method: 'POST', body: 'x'.repeat(2049) }));
  expect(oversized.status).toBe(413);
});
