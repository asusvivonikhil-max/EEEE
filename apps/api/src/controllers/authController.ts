import { Request, Response } from 'express';
import { User } from '../models/User';
import { generateTokenPair } from '../services/tokenService';
import { asyncHandler } from '../middleware/errorHandler';
import { ConflictError, UnauthorizedError } from '../errors/AppError';

// Cookie settings for refresh token
const setRefreshTokenCookie = (res: Response, token: string) => {
  res.cookie('refreshToken', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });
};

export const register = asyncHandler(async (req: Request, res: Response) => {
  const { name, email, password, role } = req.body;

  const existing = await User.findOne({ email });
  if (existing) {
    throw new ConflictError('Email already registered');
  }

  const user = await User.create({ name, email, password, role });

  const { accessToken, refreshToken, refreshExpiresAt } = generateTokenPair(user._id.toString(), user.role, user.email);

  user.refreshTokens.push({ token: refreshToken, expiresAt: refreshExpiresAt });
  await user.save();

  setRefreshTokenCookie(res, refreshToken);

  res.status(201).json({
    success: true,
    data: {
      user: user.toSafeObject(),
      accessToken,
    },
  });
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email }).select('+password');
  if (!user) {
    throw new UnauthorizedError('Invalid credentials');
  }

  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    throw new UnauthorizedError('Invalid credentials');
  }

  if (!user.isActive) {
    throw new UnauthorizedError('Account has been deactivated');
  }

  const { accessToken, refreshToken, refreshExpiresAt } = generateTokenPair(user._id.toString(), user.role, user.email);

  // Store refresh token and clean expired ones
  const now = new Date();
  user.refreshTokens = user.refreshTokens.filter(t => t.expiresAt > now);
  user.refreshTokens.push({ token: refreshToken, expiresAt: refreshExpiresAt });
  await user.save();

  setRefreshTokenCookie(res, refreshToken);

  res.json({
    success: true,
    data: {
      user: user.toSafeObject(),
      accessToken,
    },
  });
});

export const refresh = asyncHandler(async (req: Request, res: Response) => {
  const incomingToken = req.cookies?.refreshToken;
  if (!incomingToken) {
    throw new UnauthorizedError('Refresh token missing');
  }

  const user = await User.findOne({
    'refreshTokens.token': incomingToken,
    'refreshTokens.expiresAt': { $gt: new Date() },
  });

  if (!user || !user.isActive) {
    throw new UnauthorizedError('Invalid or expired refresh token');
  }

  // Rotate token pair
  const { accessToken, refreshToken: newRefresh, refreshExpiresAt } = generateTokenPair(user._id.toString(), user.role, user.email);

  // Remove incoming token, push new one
  user.refreshTokens = user.refreshTokens.filter(t => t.token !== incomingToken);
  user.refreshTokens.push({ token: newRefresh, expiresAt: refreshExpiresAt });
  await user.save();

  setRefreshTokenCookie(res, newRefresh);

  res.json({
    success: true,
    data: {
      accessToken,
    },
  });
});

export const logout = asyncHandler(async (req: Request, res: Response) => {
  const token = req.cookies?.refreshToken;

  if (token && req.user) {
    req.user.refreshTokens = req.user.refreshTokens.filter(t => t.token !== token);
    await req.user.save();
  }

  res.clearCookie('refreshToken');
  res.json({
    success: true,
    message: 'Logged out successfully',
  });
});

export const logoutAll = asyncHandler(async (req: Request, res: Response) => {
  if (req.user) {
    req.user.refreshTokens = [];
    await req.user.save();
  }

  res.clearCookie('refreshToken');
  res.json({
    success: true,
    message: 'Logged out from all devices successfully',
  });
});
