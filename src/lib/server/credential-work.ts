import { compare, hash } from 'bcryptjs';

export type CredentialJob = { operation: 'hash'; value: string } | { operation: 'verify'; value: string; stored: string };

// Runs in Node locally, or in a private Durable Object in production. Never run
// bcrypt in a Pages request: the free Pages CPU budget is too small for cost 12.
export async function performCredentialJob(job: CredentialJob): Promise<string | boolean> {
  if (typeof job.value !== 'string' || job.value.length > 200) throw new Error('Invalid credential length');
  if (job.operation === 'hash') return hash(job.value, 12);
  if (job.operation !== 'verify' || typeof job.stored !== 'string' || !/^\$2[aby]\$(?:0[4-9]|1[0-2])\$[./A-Za-z0-9]{53}$/.test(job.stored)) return false;
  return compare(job.value, job.stored);
}
