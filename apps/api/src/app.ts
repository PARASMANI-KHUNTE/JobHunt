import express, { Express, Request, Response, NextFunction } from 'express';
import { healthRouter } from './routes/health.ts';

export function createApiApp(): Express {
  const app = express();

  // Basic middleware
  app.use(express.json());

  // Request logging middleware for structured logs
  app.use((req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      if (req.path.startsWith('/api') || req.path.startsWith('/health')) {
        // Structured log output
        const logEntry = {
          time: new Date().toISOString(),
          method: req.method,
          path: req.path,
          status: res.statusCode,
          duration_ms: duration,
        };
        // Print in development or info mode
        if (process.env.NODE_ENV !== 'test') {
          console.log(`[HTTP] ${logEntry.method} ${logEntry.path} ${logEntry.status} ${logEntry.duration_ms}ms`);
        }
      }
    });
    next();
  });

  // Mount health endpoints
  app.use('/health', healthRouter);
  app.use('/api', healthRouter);

  // 404 handler for API routes
  app.use('/api/*', (req: Request, res: Response) => {
    res.status(404).json({
      error: {
        code: 'NOT_FOUND',
        message: `Endpoint ${req.method} ${req.originalUrl} not found`,
        details: [],
      },
    });
  });

  // Global error handler
  app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
    console.error('[API Error]:', err);
    res.status(500).json({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: process.env.NODE_ENV === 'production' ? 'An unexpected error occurred' : err.message,
      },
    });
  });

  return app;
}
