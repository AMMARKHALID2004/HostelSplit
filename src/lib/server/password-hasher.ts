import type { CredentialJob } from './credential-work';

export interface PasswordHasherBinding {
  idFromName(name: string): unknown;
  get(id: unknown): { fetch(input: string, init: RequestInit): Promise<Response> };
}
async function run(job: CredentialJob, binding?: PasswordHasherBinding): Promise<string | boolean> {
  if (binding) {
    const response = await binding.get(binding.idFromName('credentials')).fetch('https://password-hasher.internal/', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(job)
    });
    if (!response.ok) throw new Error('Sign-in service is temporarily unavailable. Please try again.');
    const result = await response.json() as { result: string | boolean };
    return result.result;
  }
  // Fail closed if deployment configuration is missing; never silently fall
  // back to expensive JavaScript hashing inside the production Pages Worker.
  if (process.env.NODE_ENV === 'production') throw new Error('Sign-in service is temporarily unavailable. Please try again.');
  return (await import('./credential-work')).performCredentialJob(job);
}
export async function hashCredential(value: string, binding?: PasswordHasherBinding) {
  const result = await run({ operation: 'hash', value }, binding);
  if (typeof result !== 'string' || !result.startsWith('$2b$12$')) throw new Error('Could not securely hash credential.');
  return result;
}
export async function verifyCredential(value: string, stored: string, binding?: PasswordHasherBinding) {
  if (value.length > 200) return false;
  return (await run({ operation: 'verify', value, stored }, binding)) === true;
}
