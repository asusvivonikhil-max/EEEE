import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../services/tokenService';
import { User, IUserDoc } from '../models/User';
import { UnauthorizedError } from '../errors/AppError';
import { asyncHandler } from './errorHandler';

declare global {
  namespace Express {
    interface Request {
      user?: IUserDoc;
    }
  }
}

export const authenticate = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new UnauthorizedError('Access token required');
  }

  const token = authHeader.split(' ')[1];
  const decoded = verifyAccessToken(token);

  // Verify user still exists
  const user = await User.findById(decoded.userId);
  if (!user) {
    throw new UnauthorizedError('User session no longer exists');
  }

  // Verify account is active
  if (!user.isActive) {
    throw new UnauthorizedError('Account has been deactivated');
  }

  req.user = user;
  next();
});
