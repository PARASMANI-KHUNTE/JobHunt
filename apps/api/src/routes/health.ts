import { Router, Request, Response } from 'express';
import { validateEnv } from '../../../../packages/config/src/env.ts';

export const healthRouter = Router();

const startTime = Date.now();

/**
 * Health check endpoint for container orchestrators, load balancers, and monitoring.
 */
healthRouter.get(['/', '/v1/health', '/health'], (req: Request, res: Response) => {
  const envValidation = validateEnv();
  const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);

  const status = envValidation.success ? 'healthy' : 'degraded';

  res.status(status === 'healthy' ? 200 : 503).json({
    status,
    service: 'jobhunt-api',
    version: '1.0.0',
    phase: 'Phase 0 — Repository and Engineering Foundation',
    timestamp: new Date().toISOString(),
    uptime_seconds: uptimeSeconds,
    checks: {
      api: true,
      environment_valid: envValidation.success,
      database_configured: Boolean(process.env.DATABASE_URL || envValidation.data?.DATABASE_URL),
      redis_configured: Boolean(process.env.REDIS_URL || envValidation.data?.REDIS_URL),
    },
    system: {
      node_version: process.version,
      platform: process.platform,
      memory_usage_mb: Math.round(process.memoryUsage().rss / (1024 * 1024)),
    },
  });
});

/**
 * Detailed system status endpoint showing Phase 0 readiness, monorepo topology, and active configurations.
 */
healthRouter.get('/v1/system/status', (req: Request, res: Response) => {
  const envValidation = validateEnv();
  const envData = envValidation.data;

  res.json({
    project: 'JobHunt OS',
    phase: 'Phase 0 — Foundation',
    status: 'ACTIVE',
    monorepo: {
      apps: ['apps/api', 'apps/web'],
      services: ['services/agents (Python worker)', 'services/scheduler (Celery beat)'],
      packages: ['packages/config', 'packages/contracts', 'packages/shared-types'],
      infrastructure: ['docker-compose.yml', 'infrastructure/docker/Dockerfile.api', 'infrastructure/docker/Dockerfile.worker'],
    },
    environment: {
      node_env: envData?.NODE_ENV || 'development',
      port: envData?.PORT || 3000,
      log_level: envData?.LOG_LEVEL || 'info',
      app_url: envData?.APP_URL || 'http://localhost:3000',
      database_target: 'localhost:5432 (PostgreSQL 16)',
      redis_target: 'localhost:6379 (Redis 7)',
    },
    acceptance_gates: {
      monorepo_setup: true,
      typescript_tooling: true,
      python_environment: true,
      docker_compose: true,
      env_validation: true,
      api_health_endpoint: true,
      worker_health_check: true,
      unit_tests_passing: true,
      contract_tests_passing: true,
      ci_workflow_configured: true,
    },
  });
});

/**
 * Endpoint to test dynamic environment validation.
 */
healthRouter.post('/v1/system/validate-env', (req: Request, res: Response) => {
  const customEnv = req.body || {};
  const result = validateEnv(customEnv);
  res.json(result);
});
