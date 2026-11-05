// Unit tests run with Vitest, which resolves imports the same way the app does:
// the `@` alias, files without an extension and `.vue` components.
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  test: {
    include: ['src/utils/__tests__/*.test.js', 'src/utils/__tests__/waitlistScore.spec.js', 'tests/*.test.mjs'],
    environment: 'node',
    // demo mode: unit tests never reach the hosted project, whatever client/.env holds
    env: { VITE_USE_MOCK: 'true' },
    // put back every vi.spyOn after each test, as node:test's t.mock did
    restoreMocks: true
  }
});
