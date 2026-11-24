import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: './tests',
    testMatch: '**/*.spec.js',
    timeout: 30000,
    use: {
        baseURL: process.env.E2E_BASE_URL || 'http://127.0.0.1:5173',
        channel: process.env.PLAYWRIGHT_CHANNEL || undefined
    }
});
