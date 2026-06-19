import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { config } from '../config/env';
import { UnauthorizedError } from '../errors/AppError';

const ACCESS_TOKEN_EXPIRY = '15m'; // Short-lived access token
export const REFRESH_TOKEN_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days in ms

interface AccessTokenPayload {
  userId: string;
  role: 'customer' | 'seller' | 'admin' | 'warehouse';
  email: string;
}

export const generateAccessToken = (payload: AccessTokenPayload): string => {
  return jwt.sign(
    { userId: payload.userId, role: payload.role, email: payload.email },
    config.auth.accessSecret,
    { expiresIn: ACCESS_TOKEN_EXPIRY, issuer: 'e-commerce-api', audience: 'e-commerce-users' }
  );
};

export const generateRefreshToken = (): string => {
  // Cryptographically random token
  return crypto.randomBytes(64).toString('hex');
};

export const verifyAccessToken = (token: string): AccessTokenPayload => {
  try {
    const decoded = jwt.verify(token, config.auth.accessSecret, {
      issuer: 'e-commerce-api',
      audience: 'e-commerce-users',
    }) as any;
    return {
      userId: decoded.userId,
      role: decoded.role,
      email: decoded.email,
    };
  } catch (err: any) {
    if (err.name === 'TokenExpiredError') {
      throw new UnauthorizedError('Access token has expired');
    }
    throw new UnauthorizedError('Invalid access token');
  }
};

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
}

export const generateTokenPair = (userId: string, role: 'customer' | 'seller' | 'admin' | 'warehouse', email: string): TokenPair => {
  const accessToken = generateAccessToken({ userId, role, email });
  const refreshToken = generateRefreshToken();
  const refreshExpiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_MS);
  return { accessToken, refreshToken, refreshExpiresAt };
};

export const generatePasswordResetToken = (): { raw: string; hashed: string } => {
  const raw = crypto.randomBytes(32).toString('hex');
  const hashed = crypto.createHash('sha256').update(raw).digest('hex');
  return { raw, hashed };
};
