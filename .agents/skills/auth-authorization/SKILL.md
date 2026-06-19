---
name: auth-authorization
description: >
  Use this skill whenever building, reviewing, or fixing authentication or authorization in any web application. Triggers include: login, register, logout, JWT, tokens, refresh tokens, sessions, passwords, bcrypt, role-based access, permissions, protected routes, middleware, OAuth, Google login, admin panel access, "who can access what", route guards, or any mention of "auth". Also trigger when the user says "user can't access", "unauthorized", "protect this route", "only admin should", or "check if user is logged in". Never skip this skill — auth bugs are the most critical security vulnerabilities. Always apply proactively even if user only mentions one part of auth.
---

# Authentication + Authorization Skill

## Core Philosophy

**Authentication = Who are you? Authorization = What can you do?**

These are two separate concerns. AI almost always gets one wrong:
- Builds login (authn) but forgets to protect routes (authz)
- Protects routes but doesn't check ownership (user A accessing user B's data)
- Implements access tokens but skips refresh token rotation
- Checks role but not resource ownership

This skill covers both completely.

---

## Architecture Overview

```
Request → authenticate middleware → authorize middleware → route handler
             (valid token?)           (right role/owner?)
```

Three layers every protected endpoint must pass:
1. **Authentication** — is the token valid and not expired?
2. **Role Authorization** — does this role have access to this endpoint?
3. **Ownership Authorization** — does this user own this specific resource?

---

## Step 1: User Model

```javascript
// models/User.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name:          { type: String, required: true, trim: true },
  email:         { type: String, required: true, unique: true, lowercase: true, trim: true },
  password:      { type: String, required: true, minlength: 8, select: false }, // select:false = never returned in queries
  role:          { type: String, enum: ['customer', 'seller', 'admin'], default: 'customer' },
  isActive:      { type: Boolean, default: true },
  isEmailVerified: { type: Boolean, default: false },
  refreshTokens: [{ // Store array to support multiple devices
    token:     { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
    deviceInfo: String
  }],
  passwordChangedAt: Date,
  passwordResetToken: String,
  passwordResetExpires: Date,
  loginAttempts: { type: Number, default: 0 },
  lockUntil:    Date
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Index for fast email lookups
userSchema.index({ email: 1 });

// Hash password before save — only if modified
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  this.passwordChangedAt = Date.now() - 1000; // Slightly in past to ensure tokens issued after
  next();
});

// Compare password method
userSchema.methods.comparePassword = async function(candidate) {
  return bcrypt.compare(candidate, this.password);
};

// Check if password changed after token was issued
userSchema.methods.passwordChangedAfter = function(jwtTimestamp) {
  if (this.passwordChangedAt) {
    return parseInt(this.passwordChangedAt.getTime() / 1000) > jwtTimestamp;
  }
  return false;
};

// Account lockout check
userSchema.methods.isLocked = function() {
  return this.lockUntil && this.lockUntil > Date.now();
};

// Remove sensitive fields from JSON output
userSchema.methods.toSafeObject = function() {
  const obj = this.toObject();
  delete obj.password;
  delete obj.refreshTokens;
  delete obj.passwordResetToken;
  delete obj.passwordResetExpires;
  delete obj.loginAttempts;
  delete obj.lockUntil;
  return obj;
};

module.exports = mongoose.model('User', userSchema);
```

---

## Step 2: Token Service

**Never scatter JWT logic across files. One service owns all token operations.**

```javascript
// services/tokenService.js
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const ACCESS_TOKEN_EXPIRY  = '15m';   // Short-lived
const REFRESH_TOKEN_EXPIRY = '7d';    // Long-lived
const REFRESH_TOKEN_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

const generateAccessToken = (payload) => {
  return jwt.sign(
    { userId: payload.userId, role: payload.role, email: payload.email },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRY, issuer: 'your-app', audience: 'your-app-users' }
  );
};

const generateRefreshToken = () => {
  // Cryptographically random — not JWT (harder to decode, rotate safely)
  return crypto.randomBytes(64).toString('hex');
};

const verifyAccessToken = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_ACCESS_SECRET, {
      issuer: 'your-app',
      audience: 'your-app-users'
    });
  } catch (err) {
    if (err.name === 'TokenExpiredError') throw new TokenExpiredError();
    if (err.name === 'JsonWebTokenError')  throw new InvalidTokenError();
    throw err;
  }
};

const generateTokenPair = (user) => ({
  accessToken:  generateAccessToken({ userId: user._id, role: user.role, email: user.email }),
  refreshToken: generateRefreshToken(),
  refreshExpiresAt: new Date(Date.now() + REFRESH_TOKEN_EXPIRY_MS)
});

const generatePasswordResetToken = () => {
  const raw   = crypto.randomBytes(32).toString('hex');
  const hashed = crypto.createHash('sha256').update(raw).digest('hex');
  return { raw, hashed }; // Store hashed in DB, send raw to user
};

module.exports = {
  generateAccessToken, generateRefreshToken, verifyAccessToken,
  generateTokenPair, generatePasswordResetToken,
  REFRESH_TOKEN_EXPIRY_MS
};
```

**Required environment variables:**
```env
JWT_ACCESS_SECRET=your-very-long-random-secret-min-64-chars
JWT_REFRESH_SECRET=another-very-long-random-secret-min-64-chars
```

Generate with: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`

---

## Step 3: Auth Controller

```javascript
// controllers/authController.js
const User = require('../models/User');
const { generateTokenPair } = require('../services/tokenService');
const { asyncHandler } = require('../middleware/errorHandler');
const {
  UnauthorizedError, NotFoundError, ConflictError,
  BadRequestError, AppError
} = require('../errors');

const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_TIME = 30 * 60 * 1000; // 30 minutes

// POST /api/auth/register
exports.register = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;

  const existing = await User.findOne({ email });
  if (existing) throw new ConflictError('Email already registered');

  const user = await User.create({ name, email, password });

  const { accessToken, refreshToken, refreshExpiresAt } = generateTokenPair(user);

  // Store hashed refresh token
  await User.findByIdAndUpdate(user._id, {
    $push: { refreshTokens: { token: refreshToken, expiresAt: refreshExpiresAt } }
  });

  setRefreshTokenCookie(res, refreshToken);

  res.status(201).json({
    success: true,
    data: { user: user.toSafeObject(), accessToken }
  });
});

// POST /api/auth/login
exports.login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  // +password because select:false in schema
  const user = await User.findOne({ email }).select('+password +loginAttempts +lockUntil');
  if (!user) throw new UnauthorizedError('Invalid credentials');

  // Account lockout check
  if (user.isLocked()) {
    const minutesLeft = Math.ceil((user.lockUntil - Date.now()) / 60000);
    throw new AppError(`Account locked. Try again in ${minutesLeft} minutes.`, 423, 'ACCOUNT_LOCKED');
  }

  const isMatch = await user.comparePassword(password);

  if (!isMatch) {
    // Increment failed attempts
    const updates = { $inc: { loginAttempts: 1 } };
    if (user.loginAttempts + 1 >= MAX_LOGIN_ATTEMPTS) {
      updates.$set = { lockUntil: new Date(Date.now() + LOCK_TIME) };
    }
    await User.findByIdAndUpdate(user._id, updates);
    throw new UnauthorizedError('Invalid credentials');
  }

  if (!user.isActive) throw new UnauthorizedError('Account deactivated');

  // Reset failed attempts on success
  await User.findByIdAndUpdate(user._id, {
    $set: { loginAttempts: 0, lockUntil: undefined }
  });

  const { accessToken, refreshToken, refreshExpiresAt } = generateTokenPair(user);

  await User.findByIdAndUpdate(user._id, {
    $push: { refreshTokens: { token: refreshToken, expiresAt: refreshExpiresAt } }
  });

  // Clean expired refresh tokens on login
  await User.findByIdAndUpdate(user._id, {
    $pull: { refreshTokens: { expiresAt: { $lt: new Date() } } }
  });

  setRefreshTokenCookie(res, refreshToken);

  res.json({
    success: true,
    data: { user: user.toSafeObject(), accessToken }
  });
});

// POST /api/auth/refresh
exports.refresh = asyncHandler(async (req, res) => {
  const incomingToken = req.cookies?.refreshToken;
  if (!incomingToken) throw new UnauthorizedError('Refresh token missing');

  // Find user with this exact refresh token
  const user = await User.findOne({
    'refreshTokens.token': incomingToken,
    'refreshTokens.expiresAt': { $gt: new Date() }
  });

  if (!user) {
    // Token not found or expired — possible token reuse attack
    throw new UnauthorizedError('Invalid or expired refresh token');
  }

  // Rotate: remove old refresh token, issue new pair
  const { accessToken, refreshToken: newRefresh, refreshExpiresAt } = generateTokenPair(user);

  await User.findByIdAndUpdate(user._id, {
    $pull: { refreshTokens: { token: incomingToken } },
    $push: { refreshTokens: { token: newRefresh, expiresAt: refreshExpiresAt } }
  });

  setRefreshTokenCookie(res, newRefresh);

  res.json({ success: true, data: { accessToken } });
});

// POST /api/auth/logout
exports.logout = asyncHandler(async (req, res) => {
  const token = req.cookies?.refreshToken;

  if (token) {
    // Remove this device's refresh token
    await User.findByIdAndUpdate(req.user._id, {
      $pull: { refreshTokens: { token } }
    });
  }

  res.clearCookie('refreshToken');
  res.json({ success: true, message: 'Logged out' });
});

// POST /api/auth/logout-all (revoke all devices)
exports.logoutAll = asyncHandler(async (req, res) => {
  await User.findByIdAndUpdate(req.user._id, { $set: { refreshTokens: [] } });
  res.clearCookie('refreshToken');
  res.json({ success: true, message: 'Logged out from all devices' });
});

// Helper: set httpOnly cookie
const setRefreshTokenCookie = (res, token) => {
  res.cookie('refreshToken', token, {
    httpOnly: true,       // JS cannot access
    secure: process.env.NODE_ENV === 'production', // HTTPS only in prod
    sameSite: 'strict',   // CSRF protection
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  });
};
```

---

## Step 4: Authentication Middleware

```javascript
// middleware/authenticate.js
const User = require('../models/User');
const { verifyAccessToken } = require('../services/tokenService');
const { UnauthorizedError } = require('../errors');
const { asyncHandler } = require('./errorHandler');

const authenticate = asyncHandler(async (req, res, next) => {
  // Extract token from Authorization header
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    throw new UnauthorizedError('Access token required');
  }

  const token = authHeader.split(' ')[1];
  const decoded = verifyAccessToken(token); // Throws TokenExpiredError or InvalidTokenError

  // Verify user still exists
  const user = await User.findById(decoded.userId);
  if (!user) throw new UnauthorizedError('User no longer exists');

  // Verify account is active
  if (!user.isActive) throw new UnauthorizedError('Account deactivated');

  // Verify password hasn't changed since token was issued
  if (user.passwordChangedAfter(decoded.iat)) {
    throw new UnauthorizedError('Password recently changed. Please log in again.');
  }

  req.user = user; // Attach user to request
  next();
});

module.exports = { authenticate };
```

---

## Step 5: Authorization Middleware (RBAC)

```javascript
// middleware/authorize.js
const { ForbiddenError, UnauthorizedError } = require('../errors');

// Role-based access control
const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) throw new UnauthorizedError();
  if (!roles.includes(req.user.role)) {
    throw new ForbiddenError(`Requires one of: ${roles.join(', ')}`);
  }
  next();
};

// Resource ownership check — user can only access their own data
// Unless they're admin
const requireOwnership = (getResourceUserId) => async (req, res, next) => {
  if (!req.user) throw new UnauthorizedError();
  if (req.user.role === 'admin') return next(); // Admins bypass ownership

  const resourceUserId = await getResourceUserId(req);
  if (!resourceUserId) throw new NotFoundError('Resource');

  if (resourceUserId.toString() !== req.user._id.toString()) {
    throw new ForbiddenError('Access denied — not your resource');
  }
  next();
};

// Optional auth — attaches user if token present, doesn't fail if not
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const decoded = verifyAccessToken(token);
      req.user = await User.findById(decoded.userId);
    }
  } catch (_) { /* Silently ignore — auth is optional */ }
  next();
};

module.exports = { requireRole, requireOwnership, optionalAuth };
```

---

## Step 6: Route Protection Patterns

```javascript
// routes/order.routes.js
const { authenticate } = require('../middleware/authenticate');
const { requireRole, requireOwnership } = require('../middleware/authorize');
const Order = require('../models/Order');

// Pattern 1: Authenticated only
router.get('/my-orders', authenticate, getMyOrders);

// Pattern 2: Role-based
router.get('/admin/all-orders', authenticate, requireRole('admin'), getAllOrders);
router.post('/products', authenticate, requireRole('admin', 'seller'), createProduct);

// Pattern 3: Ownership check — user can only see their own order
router.get('/:id',
  authenticate,
  requireOwnership(async (req) => {
    const order = await Order.findById(req.params.id).select('userId');
    return order?.userId;
  }),
  getOrderById
);

// Pattern 4: Mixed — admin sees all, user sees own
router.get('/:id', authenticate, async (req, res, next) => {
  if (req.user.role === 'admin') return next(); // Admin: skip ownership
  // User: verify ownership
  const order = await Order.findById(req.params.id).select('userId');
  if (order?.userId.toString() !== req.user._id.toString()) {
    throw new ForbiddenError();
  }
  next();
}, getOrderById);

// Pattern 5: Public route (no auth)
router.get('/products', getProducts); // Anyone can browse

// Pattern 6: Optional auth (personalized vs generic)
router.get('/recommendations', optionalAuth, getRecommendations);
// req.user exists → personalized; req.user undefined → generic
```

---

## Step 7: Password Reset Flow

```javascript
// controllers/authController.js (continued)
const crypto = require('crypto');
const { generatePasswordResetToken } = require('../services/tokenService');

// POST /api/auth/forgot-password
exports.forgotPassword = asyncHandler(async (req, res) => {
  const user = await User.findOne({ email: req.body.email });

  // Always return 200 — never reveal if email exists
  if (!user) {
    return res.json({ success: true, message: 'If that email exists, a reset link was sent.' });
  }

  const { raw, hashed } = generatePasswordResetToken();

  await User.findByIdAndUpdate(user._id, {
    passwordResetToken: hashed,
    passwordResetExpires: new Date(Date.now() + 10 * 60 * 1000) // 10 minutes
  });

  const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${raw}`;
  await emailService.sendPasswordReset(user.email, resetUrl);

  res.json({ success: true, message: 'If that email exists, a reset link was sent.' });
});

// POST /api/auth/reset-password
exports.resetPassword = asyncHandler(async (req, res) => {
  const hashedToken = crypto.createHash('sha256').update(req.body.token).digest('hex');

  const user = await User.findOne({
    passwordResetToken: hashedToken,
    passwordResetExpires: { $gt: new Date() }
  });

  if (!user) throw new BadRequestError('Token invalid or expired', 'INVALID_RESET_TOKEN');

  user.password = req.body.password;
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  user.refreshTokens = []; // Invalidate all sessions on password reset
  await user.save();

  res.json({ success: true, message: 'Password reset successful. Please log in again.' });
});
```

---

## Step 8: Frontend Auth (React)

For complete React auth context, token storage, and route guards → read `references/frontend-auth.md`

Key rules:
- **Never store tokens in localStorage** (XSS vulnerable) — use memory for access token + httpOnly cookie for refresh
- Axios interceptor silently refreshes expired access tokens
- React route guards redirect unauthenticated users
- Role-based component rendering hides forbidden UI

---

## Step 9: OAuth (Google Login)

For full Passport.js Google OAuth2 setup → read `references/oauth.md`

---

## Step 10: Security Hardening Checklist

Before marking auth complete, verify every item:

- [ ] Passwords hashed with bcrypt cost factor ≥ 12
- [ ] `password` field has `select: false` in schema
- [ ] Access tokens expire in ≤ 15 minutes
- [ ] Refresh tokens are cryptographically random (not JWT)
- [ ] Refresh token rotation on every use
- [ ] Refresh token stored as httpOnly cookie (not localStorage)
- [ ] `passwordChangedAfter` check in authenticate middleware
- [ ] Account lockout after 5 failed attempts
- [ ] Password reset tokens are hashed in DB, raw sent to user
- [ ] Password reset invalidates all active sessions
- [ ] Logout-all endpoint exists to revoke all devices
- [ ] Forgot password always returns 200 (never reveals email existence)
- [ ] All protected routes use both `authenticate` + appropriate `authorize`
- [ ] Ownership check on all user-specific resources
- [ ] Admin bypass built into ownership middleware
- [ ] Role stored in JWT payload for fast checks (re-verified from DB on sensitive ops)
- [ ] JWT secrets are ≥ 64 random chars and in `.env`
- [ ] `.env` is in `.gitignore`

---

## Reference Files

- `references/frontend-auth.md` — React auth context, token refresh interceptor, route guards
- `references/oauth.md` — Google OAuth2 with Passport.js
- `references/permissions.md` — Fine-grained permissions beyond roles (ABAC)
- `references/email-verification.md` — Email verification flow on register
