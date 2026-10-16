import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const key =
    process.env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || '';
  let role = '';
  try {
    role = JSON.parse(
      Buffer.from(key.split('.')[1] || '', 'base64url').toString(),
    ).role;
  } catch {
    /* Publishable keys are not JWTs. */
  }
  if (key.startsWith('sb_secret_') || role === 'service_role')
    throw new Error(
      'A server secret was placed in VITE_SUPABASE_ANON_KEY. Use a public anon/publishable key, and rotate the exposed secret.',
    );
  return {
    plugins: [react()],
    server: { host: '0.0.0.0' },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('/node_modules/@supabase/')) return 'supabase';
          },
        },
      },
    },
  };
});
