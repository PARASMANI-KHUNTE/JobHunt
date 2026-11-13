import test from 'node:test';
import assert from 'node:assert/strict';
import { validateEnv, getEnv } from './env.ts';

test('validateEnv accepts valid development configuration with JWT_SECRET', () => {
  const result = validateEnv({
    JWT_SECRET: 'development-test-jwt-secret-with-minimum-32-chars',
  });
  assert.equal(result.success, true);
  assert.ok(result.data);
  assert.equal(result.data?.PORT, 3000);
  assert.equal(result.data?.NODE_ENV, 'development');
  assert.equal(result.data?.LOG_LEVEL, 'info');
  assert.equal(result.data?.DATABASE_URL, 'postgresql://localhost:5432/jobhunt_os');
  assert.ok(result.data?.REDIS_URL.includes('redis://'));
});

test('validateEnv rejects missing JWT_SECRET', () => {
  const result = validateEnv({});
  assert.equal(result.success, false);
  assert.ok(result.errors?.JWT_SECRET);
});

test('validateEnv parses custom valid environment parameters', () => {
  const custom = {
    PORT: '8080',
    NODE_ENV: 'production',
    LOG_LEVEL: 'warn',
    APP_URL: 'https://jobhunt.example.com',
    DATABASE_URL: 'postgresql://prod_user:secret@db.internal:5432/jobhunt_prod',
    REDIS_URL: 'redis://redis.internal:6379/1',
    JWT_SECRET: 'super-secure-production-secret-key-32-chars-minimum',
    GEMINI_API_KEY: 'test_gemini_api_key',
  };

  const result = validateEnv(custom);
  assert.equal(result.success, true);
  assert.equal(result.data?.PORT, 8080);
  assert.equal(result.data?.NODE_ENV, 'production');
  assert.equal(result.data?.LOG_LEVEL, 'warn');
  assert.equal(result.data?.APP_URL, 'https://jobhunt.example.com');
});

test('validateEnv detects and rejects invalid port numbers', () => {
  const invalid = {
    PORT: 'not-a-number',
  };

  const result = validateEnv(invalid);
  assert.equal(result.success, false);
  assert.ok(result.errors?.PORT);
});

test('validateEnv detects and rejects port out of range', () => {
  const invalid = {
    PORT: '70000',
  };

  const result = validateEnv(invalid);
  assert.equal(result.success, false);
  assert.ok(result.errors?.PORT);
});

test('validateEnv rejects too-short JWT secrets', () => {
  const invalid = {
    JWT_SECRET: 'short',
  };

  const result = validateEnv(invalid);
  assert.equal(result.success, false);
  assert.ok(result.errors?.JWT_SECRET);
});

test('validateEnv rejects default placeholder JWT_SECRET in production', () => {
  const invalid = {
    NODE_ENV: 'production',
    JWT_SECRET: 'dev-jwt-secret-replace-in-production-min-32-chars',
  };

  const result = validateEnv(invalid);
  assert.equal(result.success, false);
  assert.ok(result.errors?.JWT_SECRET);
});

test('getEnv throws clear descriptive error when configuration fails', () => {
  assert.throws(() => {
    getEnv({
      PORT: 'invalid-port',
      APP_URL: 'not-a-url',
    });
  }, (err: Error) => {
    return err.message.includes('[JobHunt OS] Invalid environment configuration');
  });
});
