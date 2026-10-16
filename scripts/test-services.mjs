// Real Auth/PostgREST/Postgres/Mailpit, bound to localhost. Random in-memory keys.
import { execFileSync, spawnSync } from 'node:child_process';
import { createHmac, randomBytes } from 'node:crypto';
import { chmodSync, readFileSync } from 'node:fs';
const password = randomBytes(24).toString('hex');
const secret = randomBytes(32).toString('hex');
const env = {
  ...process.env,
  LOCAL_DB_PASSWORD: password,
  LOCAL_JWT_SECRET: secret,
};
const composeArgs = ['compose', '-f', 'dev/compose.yml'];
let owned = false;
function compose(args) {
  const result = spawnSync('docker', [...composeArgs, ...args], {
    env,
    stdio: 'inherit',
  });
  if (result.status !== 0)
    throw new Error(`Local service operation failed: ${args[0]}`);
}
function sql(input) {
  const result = spawnSync(
    'docker',
    [
      'exec',
      '-i',
      'supabase_db_terms-apply',
      'psql',
      '-U',
      'postgres',
      '-d',
      'postgres',
      '-v',
      'ON_ERROR_STOP=1',
      '-v',
      `db_password=${password}`,
    ],
    { input, stdio: ['pipe', 'pipe', 'pipe'] },
  );
  if (result.status !== 0)
    throw new Error(
      'Local SQL setup failed. Check migration permissions and local auth readiness.',
    );
}
function jwt(role) {
  const base64 = (value) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  const unsigned = `${base64({ alg: 'HS256', typ: 'JWT' })}.${base64({ role, iss: 'supabase-local', exp: Math.floor(Date.now() / 1000) + 3600 })}`;
  return `${unsigned}.${createHmac('sha256', secret).update(unsigned).digest('base64url')}`;
}
async function waitFor(url) {
  for (let i = 0; i < 90; i++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (response.ok) return;
    } catch {
      /* Startup is in progress. */
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error('Local services did not become ready');
}
let code = 1;
try {
  const existing = execFileSync(
    'docker',
    [
      'ps',
      '-a',
      '--filter',
      'name=^/supabase_db_terms-apply$',
      '--format',
      '{{.Names}}',
    ],
    { encoding: 'utf8' },
  ).trim();
  const existingStack = execFileSync(
    'docker',
    [
      'ps',
      '-a',
      '--filter',
      'label=com.docker.compose.project=terms-apply-local',
      '--format',
      '{{.Names}}',
    ],
    { encoding: 'utf8' },
  ).trim();
  if (existing || existingStack)
    throw new Error(
      'A local Supabase test container already exists. Stop it first to preserve its data.',
    );
  chmodSync('dev/kong.yml', 0o644);
  owned = true;
  compose(['up', '-d', '--wait', 'db']);
  sql(readFileSync('dev/bootstrap.sql', 'utf8'));
  compose(['up', '-d']);
  await waitFor('http://127.0.0.1:54321/auth/v1/health');
  sql(readFileSync('dev/auth-claims.sql', 'utf8'));
  sql(readFileSync('supabase/migrations/202610170001_initial.sql', 'utf8'));
  sql("notify pgrst, 'reload schema';");
  await waitFor('http://127.0.0.1:54321/rest/v1/');
  const result = spawnSync(
    'npx',
    ['playwright', 'test', 'tests/e2e/services.spec.ts'],
    {
      stdio: 'inherit',
      env: {
        ...process.env,
        TEST_LOCAL_SUPABASE: '1',
        VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
        VITE_SUPABASE_ANON_KEY: jwt('anon'),
        TEST_SUPABASE_SERVICE_ROLE_KEY: jwt('service_role'),
        VITE_REMINDERS_ENABLED: 'true',
      },
    },
  );
  code = result.status ?? 1;
} catch (error) {
  console.error(
    error instanceof Error
      ? error.message.split('\n')[0]
      : 'Local integration failed',
  );
} finally {
  if (owned) {
    const result = spawnSync('docker', [...composeArgs, 'down', '--volumes'], {
      env,
      stdio: 'inherit',
    });
    if (result.status !== 0) code = 1;
  }
}
process.exit(code);
