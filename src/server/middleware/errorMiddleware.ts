import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';

export function sanitizeErrorResponse(
  err: any,
  isProd = process.env.NODE_ENV === 'production'
): { error: string } {
  const rawMessage = err?.message || 'An unexpected error occurred.';
  const isInternalDbError = Boolean(
    err?.routine ||
    err?.severity ||
    (typeof rawMessage === 'string' && (
      rawMessage.includes('relation "') ||
      rawMessage.includes('syntax error at') ||
      rawMessage.includes('column "') ||
      rawMessage.includes('foreign key') ||
      rawMessage.includes('PGlite')
    ))
  );

  if (isProd && isInternalDbError) {
    return { error: 'An internal database error occurred.' };
  }
  if (isProd) {
    return { error: 'An internal server error occurred.' };
  }
  return { error: rawMessage };
}

export function errorHandler(
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Handle Zod validation errors
  if (err instanceof ZodError) {
    const formattedErrors: Record<string, string> = {};
    const issues = (err as any).issues || (err as any).errors || [];
    issues.forEach((e: any) => {
      const field = Array.isArray(e.path) ? e.path.join('.') : 'general';
      if (!formattedErrors[field]) {
        formattedErrors[field] = e.message;
      }
    });

    res.status(422).json({
      success: false,
      message: issues[0]?.message || 'Validation failed.',
      errors: formattedErrors,
    });
    return;
  }

  const isProd = process.env.NODE_ENV === 'production';
  const statusCode = err.statusCode || err.status || 500;
  
  // Log internal server errors securely server-side
  if (statusCode >= 500) {
    console.error(`[SERVER_ERROR] [${new Date().toISOString()}] ${req.method} ${req.originalUrl}:`, err);
  }

  // Sanitize internal error messages in production or for internal database errors
  let message = err.message || 'An unexpected server error occurred.';
  const isInternalDbError = Boolean(
    err.routine ||
    err.severity ||
    (typeof message === 'string' && (
      message.includes('relation "') ||
      message.includes('syntax error at') ||
      message.includes('column "') ||
      message.includes('foreign key') ||
      message.includes('PGlite')
    ))
  );

  if (statusCode >= 500 && (isProd || isInternalDbError)) {
    message = 'An internal server error occurred. Please try again later.';
  }

  res.status(statusCode).json({
    success: false,
    message,
    field: err.field,
    requiresVerification: err.requiresVerification,
    userId: err.userId,
    retryAfter: err.retryAfter,
  });
}
