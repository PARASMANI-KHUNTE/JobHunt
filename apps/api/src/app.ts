import express, { Express, Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';
import { healthRouter } from './routes/health.ts';
import { v1Router } from './routes/v1.ts';

export function createApiApp(): Express {
  const app = express();

  app.use(express.json({ limit: '1mb' }));

  // Correlation Request ID and Structured Logging Middleware (Phase 10)
  app.use((req: Request, res: Response, next: NextFunction) => {
    const requestId = req.headers['x-request-id']?.toString() || `req_${crypto.randomBytes(6).toString('hex')}`;
    res.setHeader('X-Request-Id', requestId);
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      if (req.path.startsWith('/api') || req.path.startsWith('/health')) {
        if (process.env.NODE_ENV !== 'test') {
          console.log(
            `[HTTP] [${requestId}] ${req.method} ${req.path} ${res.statusCode} ${duration}ms`
          );
        }
      }
    });
    next();
  });

  // Mount Health & Diagnostics Routes
  app.use('/health', healthRouter);
  app.use('/api', healthRouter);

  // Mount Canonical /api/v1 REST Endpoints (Phases 1–10)
  app.use('/api/v1', v1Router);

  // 404 Handler for unmatched API routes
  app.use('/api/*', (req: Request, res: Response) => {
    res.status(404).json({
      error: {
        code: 'NOT_FOUND',
        message: `Endpoint ${req.method} ${req.originalUrl} not found`,
        details: [],
      },
    });
  });

  // Global Error Handler (Never exposes internal stack traces in responses)
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[API Error]:', err.message);
    res.status(500).json({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message:
          process.env.NODE_ENV === 'production'
            ? 'An unexpected error occurred'
            : err.message,
      },
    });
  });

  return app;
}
