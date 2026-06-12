import { defineConfig } from 'vitest/config'

// Tests cover src/sim only (pure TypeScript, no DOM), so the svelte
// plugin is not needed here.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
  },
})
