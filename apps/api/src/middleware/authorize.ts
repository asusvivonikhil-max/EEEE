import { Request, Response, NextFunction } from 'express';
import { ForbiddenError, UnauthorizedError } from '../errors/AppError';

export const requireRole = (...roles: ('customer' | 'seller' | 'admin' | 'warehouse')[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new UnauthorizedError('Authentication required');
    }
    if (!roles.includes(req.user.role)) {
      throw new ForbiddenError(`Forbidden: Requires one of roles: [${roles.join(', ')}]`);
    }
    next();
  };
};
