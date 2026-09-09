import { Request, Response, NextFunction } from 'express';

export class AppError extends Error {
  statusCode: number;
  isOperational: boolean;

  constructor(message: string, statusCode: number = 500, isOperational: boolean = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }
}

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  console.error('Error:', {
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    timestamp: new Date().toISOString(),
  });

  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: err.message,
      code: err.statusCode,
    });
    return;
  }

  // Prisma errors
  if (err.name === 'PrismaClientKnownRequestError') {
    const prismaError = err as unknown as { code: string; meta?: Record<string, unknown> };
    console.error('Prisma error:', prismaError.code, prismaError.meta);

    switch (prismaError.code) {
      case 'P2002':
        res.status(409).json({ error: 'Duplicate value error', code: 409 });
        return;
      case 'P2003':
        res.status(400).json({ error: 'Foreign key constraint error', code: 400 });
        return;
      case 'P2025':
        res.status(404).json({ error: 'Record not found', code: 404 });
        return;
      default:
        res.status(500).json({ error: 'Database error', code: 500 });
        return;
    }
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    res.status(401).json({ error: 'Invalid token', code: 401 });
    return;
  }

  if (err.name === 'TokenExpiredError') {
    res.status(401).json({ error: 'Token expired', code: 401 });
    return;
  }

  // ValidationError
  if (err.name === 'ValidationError') {
    const validationError = err as { details?: Array<{ path?: string; message?: string }> };
    const messages = validationError.details?.map(d =>
      d.path ? `${d.path}: ${d.message}` : d.message
    ) || ['Validation error'];

    res.status(400).json({
      error: 'Validation failed',
      details: messages,
      code: 400,
    });
    return;
  }

  // Zod errors
  if (err.name === 'ZodError') {
    const zodError = err as { errors?: Array<{ path?: string[]; message?: string }> };
    const messages = zodError.errors?.map(e =>
      e.path?.join('.') ? `${e.path.join('.')}: ${e.message}` : e.message
    ) || ['Validation error'];

    res.status(400).json({
      error: 'Validation failed',
      details: messages,
      code: 400,
    });
    return;
  }

  // Default error
  res.status(500).json({
    error: process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message,
    code: 500,
  });
}

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: 'Resource not found',
    code: 404,
  });
}
