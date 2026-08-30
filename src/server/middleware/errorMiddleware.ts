import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';

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

  const statusCode = err.statusCode || err.status || 500;
  const message = err.message || 'An unexpected server error occurred.';

  res.status(statusCode).json({
    success: false,
    message,
    field: err.field,
    requiresVerification: err.requiresVerification,
    userId: err.userId,
    retryAfter: err.retryAfter,
  });
}
