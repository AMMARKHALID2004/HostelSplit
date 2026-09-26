import { spawnSync } from 'node:child_process';

if (process.env.CF_PAGES === '1') {
  if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) {
    console.error('Cloudflare Pages needs TURSO_DATABASE_URL and TURSO_AUTH_TOKEN before the build.');
    process.exit(1);
  }
  const result = spawnSync('npm', ['run', 'db:migrate'], { stdio: 'inherit' });
  process.exit(result.status ?? 1);
}
