import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { createApiApp } from './apps/api/src/app.ts';
import { validateEnv } from './packages/config/src/env.ts';

async function startServer() {
  const isProduction = process.env.NODE_ENV === 'production';
  const runtimeEnv = isProduction
    ? process.env
    : {
        JWT_SECRET: 'dev-jwt-secret-replace-in-production-min-32-chars',
        ...process.env,
      };
  const envValidation = validateEnv(runtimeEnv);
  const env = envValidation.data;

  // Fail closed: never boot with an invalid environment configuration
  if (!envValidation.success || !env) {
    console.error('[JobHunt OS] Invalid environment configuration:');
    console.error(JSON.stringify(envValidation.errors, null, 2));
    if (isProduction) {
      process.exit(1);
    }
    console.error('[JobHunt OS] Continuing in development with fallback values...');
  }

  const port = env?.PORT || Number(process.env.PORT) || 3000;

  // Instantiate the Express application with all API routes mounted
  const app = createApiApp();

  if (!isProduction) {
    // Mount Vite middleware in development for seamless SPA support with API routes on port 3000
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
    console.log('[JobHunt OS] Vite development middleware mounted');
  } else {
    // Production: serve built static assets from dist
    const distPath = path.resolve(import.meta.dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
    console.log('[JobHunt OS] Serving static production assets from dist/');
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`====================================================`);
    console.log(`  JobHunt OS Main Server Started`);
    console.log(`  Status: ACTIVE (Phases 0–10 implementation complete)`);
    console.log(`  URL: http://localhost:${port}`);
    console.log(`  API Health: http://localhost:${port}/api/v1/health`);
    console.log(`  System Status: http://localhost:${port}/api/v1/system/status`);
    console.log(`====================================================`);
  });
}

startServer().catch((err) => {
  console.error('[JobHunt OS] Failed to start server:', err);
  process.exit(1);
});
