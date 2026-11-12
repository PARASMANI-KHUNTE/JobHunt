import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { AddressInfo } from 'node:net';
import { createApiApp } from './app.ts';

test('GET /health returns healthy status and service metadata', async () => {
  const app = createApiApp();
  const server = createServer(app);

  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as AddressInfo).port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/health`);
    assert.equal(res.status, 200);

    const json = await res.json() as any;
    assert.equal(json.status, 'healthy');
    assert.equal(json.service, 'jobhunt-api');
    assert.equal(json.version, '1.0.0');
    assert.ok(json.checks.api);
    assert.ok(json.checks.environment_valid);
  } finally {
    server.close();
  }
});

test('GET /api/v1/health is accessible at canonical API path', async () => {
  const app = createApiApp();
  const server = createServer(app);

  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as AddressInfo).port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/v1/health`);
    assert.equal(res.status, 200);

    const json = await res.json() as any;
    assert.equal(json.status, 'healthy');
    assert.equal(json.service, 'jobhunt-api');
  } finally {
    server.close();
  }
});

test('GET /api/v1/system/status returns monorepo topology and acceptance gates', async () => {
  const app = createApiApp();
  const server = createServer(app);

  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as AddressInfo).port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/v1/system/status`);
    assert.equal(res.status, 200);

    const json = await res.json() as any;
    assert.equal(json.project, 'JobHunt OS');
    assert.equal(json.phase, 'Phase 0 — Foundation');
    assert.equal(json.acceptance_gates.docker_compose, true);
    assert.equal(json.acceptance_gates.worker_health_check, true);
  } finally {
    server.close();
  }
});

test('POST /api/v1/system/validate-env validates custom environment payloads', async () => {
  const app = createApiApp();
  const server = createServer(app);

  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as AddressInfo).port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/v1/system/validate-env`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ PORT: 'invalid_port' }),
    });
    assert.equal(res.status, 200);

    const json = await res.json() as any;
    assert.equal(json.success, false);
    assert.ok(json.errors?.PORT);
  } finally {
    server.close();
  }
});
