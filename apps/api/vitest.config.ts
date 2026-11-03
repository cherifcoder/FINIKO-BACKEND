import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
    env: {
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      MONGODB_URI: process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/finiko_test',
      JWT_ACCESS_SECRET: 'test-finiko-access-secret-0123456789abcdef',
      OTP_PEPPER: 'test-finiko-otp-pepper-0123456789',
      OTP_EXPOSE_CODE: 'true',
      SMS_PROVIDER: 'noop',
      ARGON2_MEMORY_KIB: '8192',
      ARGON2_TIME_COST: '1',
      ARGON2_PARALLELISM: '1',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/server.ts', 'src/types/**'],
    },
  },
});
