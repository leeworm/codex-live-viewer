import {defineConfig} from 'vitest/config';
export default defineConfig({test:{include:['codex-panel/**/*.test.ts'],environment:'node',testTimeout:30000,maxWorkers:2}});
