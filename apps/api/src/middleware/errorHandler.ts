import { Request, Response, NextFunction } from 'express';
import { AppError } from '../errors/AppError';
import { handleMongoError } from '../utils/dbErrorHandler';

export const errorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
  // Translate Mongo errors first
  const mongoErr = handleMongoError(err);
  const activeErr = mongoErr || err;

  // Operational errors (safe to expose details)
  if (activeErr instanceof AppError && activeErr.isOperational) {
    return res.status(activeErr.statusCode).json({
      success: false,
      code: activeErr.code,
      message: activeErr.message,
      ...(activeErr.details && { details: activeErr.details }),
      ...(process.env.NODE_ENV === 'development' && { stack: activeErr.stack }),
    });
  }

  // Programmer or unknown error (log fully, hide details from client in production)
  console.error('❌ UNHANDLED SERVER ERROR:', {
    message: err.message,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
    body: req.body,
  });

  return res.status(500).json({
    success: false,
    code: 'INTERNAL_SERVER_ERROR',
    message: process.env.NODE_ENV === 'production'
      ? 'Something went wrong. Please try again later.'
      : err.message,
  });
};

// Async wrapper helper for route controllers
export const asyncHandler = (fn: any) => (req: Request, res: Response, next: NextFunction) =>
  Promise.resolve(fn(req, res, next)).catch(next);
