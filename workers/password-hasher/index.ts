import { performCredentialJob, type CredentialJob } from '../../src/lib/server/credential-work';

// No public HTTP route and no database/storage use. Only our Pages binding can
// call this class. Passwords are processed in memory and never logged or saved.
export class PasswordHasher {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
    const body = await request.text();
    if (body.length > 2048) return new Response('Request too large', { status: 413 });
    try {
      const job = JSON.parse(body) as CredentialJob;
      if (!job || !['hash', 'verify'].includes(job.operation)) return new Response('Invalid operation', { status: 400 });
      return Response.json({ result: await performCredentialJob(job) });
    } catch {
      return new Response('Credential operation failed', { status: 400 });
    }
  }
}
export default { fetch: () => new Response('Not found', { status: 404 }) };
