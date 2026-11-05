// Server unit and route tests run with Vitest. The tests stay CommonJS (require) like the server.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/*.test.js'],
    environment: 'node'
  }
});
