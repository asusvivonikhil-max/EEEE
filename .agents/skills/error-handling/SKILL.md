---
name: error-handling
description: >
  Use this skill whenever writing, reviewing, or fixing any backend or frontend code that needs error handling. Triggers include: building APIs, writing Express/Node.js routes, React components with async calls, database operations, payment integrations, file uploads, authentication flows, third-party API calls, or any code involving try/catch. Also trigger when user says "something goes wrong", "app crashes", "unhandled error", "500 error", "error boundaries", or "handle failures". Do NOT skip this skill for "simple" code — missing error handling is the #1 cause of production failures. Always apply this skill proactively, even if the user hasn't mentioned error handling explicitly.
---

# Error Handling Skill

## Core Philosophy

**Every function that can fail, must handle failure explicitly.**

AI-generated code defaults to happy-path only. This skill forces complete error coverage:
- Operational errors (expected: DB down, network timeout, invalid input)
- Programmer errors (unexpected: null reference, wrong type — crash fast, fix the bug)
- Async errors (Promises, async/await — must always be caught)
- Third-party errors (Stripe, AWS, Twilio — each has its own error shape)

---

## Step 1: Identify error type before writing code

Ask: what can go wrong here?

| Error Category | Examples | Strategy |
|---|---|---|
| Validation | Missing field, wrong type, out of range | Reject early, return 400 |
| Authentication | Invalid token, expired session | Return 401 |
| Authorization | Wrong role, forbidden resource | Return 403 |
| Not Found | User/product doesn't exist | Return 404 |
| Conflict | Duplicate email, race condition | Return 409 |
| External Service | Stripe down, S3 timeout | Retry + fallback |
| Database | Connection lost, query timeout | Log + return 503 |
| Unknown | Anything else | Log full stack, return 500 |

---

## Step 2: Custom Error Classes (Backend — Node.js)

Always create typed errors. Read → `references/custom-errors.md`

```javascript
// errors/AppError.js
class AppError extends Error {
  constructor(message, statusCode, code, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;           // Machine-readable: 'USER_NOT_FOUND'
    this.details = details;     // Extra context (validation errors, etc.)
    this.isOperational = true;  // Distinguishes from programmer errors
    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError extends AppError {
  constructor(details) {
    super('Validation failed', 400, 'VALIDATION_ERROR', details);
  }
}

class NotFoundError extends AppError {
  constructor(resource) {
    super(`${resource} not found`, 404, 'NOT_FOUND');
  }
}

class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(message, 403, 'FORBIDDEN');
  }
}

class ConflictError extends AppError {
  constructor(message) {
    super(message, 409, 'CONFLICT');
  }
}

class ExternalServiceError extends AppError {
  constructor(service, originalError) {
    super(`${service} service unavailable`, 503, 'EXTERNAL_SERVICE_ERROR');
    this.service = service;
    this.originalError = originalError;
  }
}

module.exports = {
  AppError, ValidationError, NotFoundError,
  UnauthorizedError, ForbiddenError, ConflictError, ExternalServiceError
};
```

---

## Step 3: Global Error Middleware (Express)

**One place to handle all errors. Never handle errors inline in routes.**

```javascript
// middleware/errorHandler.js
const { AppError } = require('../errors/AppError');
const logger = require('../utils/logger');

const errorHandler = (err, req, res, next) => {
  // Already operational — safe to expose message
  if (err.isOperational) {
    return res.status(err.statusCode).json({
      success: false,
      code: err.code,
      message: err.message,
      ...(err.details && { details: err.details }),
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
  }

  // Programmer error — log fully, hide details from client
  logger.error('UNHANDLED ERROR', {
    message: err.message,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
    body: req.body,
    user: req.user?.id
  });

  return res.status(500).json({
    success: false,
    code: 'INTERNAL_SERVER_ERROR',
    message: process.env.NODE_ENV === 'production'
      ? 'Something went wrong. Please try again later.'
      : err.message
  });
};

// Handle async route errors — wrap every async route handler
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

module.exports = { errorHandler, asyncHandler };
```

Register LAST in Express app:
```javascript
// app.js
app.use('/api', routes);
app.use(errorHandler); // Must be after all routes
```

---

## Step 4: Route-Level Error Handling Pattern

```javascript
// routes/user.routes.js
const { asyncHandler } = require('../middleware/errorHandler');
const { NotFoundError, ConflictError } = require('../errors/AppError');

// ✅ CORRECT — asyncHandler catches all throws
router.get('/:id', asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw new NotFoundError('User');
  res.json({ success: true, data: user });
}));

// ✅ CORRECT — Duplicate email on register
router.post('/register', asyncHandler(async (req, res) => {
  const exists = await User.findOne({ email: req.body.email });
  if (exists) throw new ConflictError('Email already registered');
  const user = await User.create(req.body);
  res.status(201).json({ success: true, data: user });
}));

// ❌ WRONG — naked async route, errors swallowed
router.get('/:id', async (req, res) => {
  const user = await User.findById(req.params.id); // throws? unhandled!
  res.json(user);
});
```

---

## Step 5: Database Error Handling

```javascript
// utils/dbErrorHandler.js
const { ConflictError, AppError } = require('../errors/AppError');

const handleMongoError = (err) => {
  // Duplicate key (unique index violation)
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    return new ConflictError(`${field} already exists`);
  }
  // Validation error from Mongoose schema
  if (err.name === 'ValidationError') {
    const details = Object.values(err.errors).map(e => ({
      field: e.path,
      message: e.message
    }));
    return new ValidationError(details);
  }
  // Cast error (invalid ObjectId)
  if (err.name === 'CastError') {
    return new AppError(`Invalid ${err.path}: ${err.value}`, 400, 'INVALID_ID');
  }
  return null; // Not a known Mongo error
};

module.exports = { handleMongoError };
```

Use in global error handler:
```javascript
// In errorHandler middleware, before isOperational check:
const mongoErr = handleMongoError(err);
if (mongoErr) return errorHandler(mongoErr, req, res, next);
```

---

## Step 6: External Service Error Handling

For every third-party call: **always wrap, always handle, always log.**

### Stripe
```javascript
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { ExternalServiceError, AppError } = require('../errors/AppError');

const createPaymentIntent = async (amount, currency, customerId) => {
  try {
    return await stripe.paymentIntents.create({ amount, currency, customer: customerId });
  } catch (err) {
    if (err.type === 'StripeCardError') {
      throw new AppError(err.message, 400, 'CARD_ERROR');
    }
    if (err.type === 'StripeRateLimitError') {
      throw new ExternalServiceError('Stripe', err);
    }
    if (err.type === 'StripeInvalidRequestError') {
      throw new AppError('Invalid payment request', 400, 'PAYMENT_INVALID');
    }
    // StripeConnectionError, StripeAPIError, etc.
    throw new ExternalServiceError('Stripe', err);
  }
};
```

### AWS S3
```javascript
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { ExternalServiceError } = require('../errors/AppError');

const uploadToS3 = async (key, buffer, mimetype) => {
  try {
    const client = new S3Client({ region: process.env.AWS_REGION });
    await client.send(new PutObjectCommand({
      Bucket: process.env.S3_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: mimetype
    }));
    return `https://${process.env.S3_BUCKET}.s3.amazonaws.com/${key}`;
  } catch (err) {
    throw new ExternalServiceError('AWS S3', err);
  }
};
```

For full retry logic with exponential backoff → read `references/retry-logic.md`

---

## Step 7: Frontend Error Handling (React)

### Error Boundary — catches render errors
```jsx
// components/ErrorBoundary.jsx
import { Component } from 'react';

class ErrorBoundary extends Component {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught:', error, info);
    // Send to error tracking: Sentry.captureException(error)
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="error-container">
          <h2>Something went wrong</h2>
          <button onClick={() => this.setState({ hasError: false })}>
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// Usage — wrap every major section
<ErrorBoundary fallback={<ProductListError />}>
  <ProductList />
</ErrorBoundary>
```

### API call error handling
```javascript
// utils/apiClient.js
import axios from 'axios';

const api = axios.create({ baseURL: '/api/v1' });

// Response interceptor — normalize all errors
api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const { response } = error;

    if (!response) {
      // Network error — no response received
      return Promise.reject({ code: 'NETWORK_ERROR', message: 'Check your connection' });
    }

    const { status, data } = response;

    if (status === 401) {
      // Token expired — redirect to login
      localStorage.removeItem('token');
      window.location.href = '/login';
    }

    if (status === 403) {
      return Promise.reject({ code: 'FORBIDDEN', message: 'You do not have permission' });
    }

    if (status === 422 || status === 400) {
      // Validation errors — return field-level details
      return Promise.reject({ code: data.code, message: data.message, details: data.details });
    }

    if (status >= 500) {
      return Promise.reject({ code: 'SERVER_ERROR', message: 'Server error. Please try again.' });
    }

    return Promise.reject(data);
  }
);

export default api;
```

### Async hook with error state
```javascript
// hooks/useAsync.js
import { useState, useCallback } from 'react';

const useAsync = (asyncFn) => {
  const [state, setState] = useState({ loading: false, error: null, data: null });

  const execute = useCallback(async (...args) => {
    setState({ loading: true, error: null, data: null });
    try {
      const data = await asyncFn(...args);
      setState({ loading: false, error: null, data });
      return data;
    } catch (err) {
      setState({ loading: false, error: err, data: null });
      throw err;
    }
  }, [asyncFn]);

  return { ...state, execute };
};

// Usage
const { loading, error, data, execute } = useAsync(api.post.bind(api, '/orders'));
```

---

## Step 8: Unhandled Rejection & Uncaught Exception (Node.js)

**Add to your main server file — catches anything that slips through:**

```javascript
// server.js
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Promise Rejection', { reason, promise });
  // Give server time to finish current requests, then exit
  server.close(() => process.exit(1));
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception — shutting down', { message: err.message, stack: err.stack });
  process.exit(1); // Crash immediately — programmer error
});

// Graceful shutdown on SIGTERM (Docker/Kubernetes stop signal)
process.on('SIGTERM', () => {
  logger.info('SIGTERM received — shutting down gracefully');
  server.close(() => {
    mongoose.connection.close(false, () => process.exit(0));
  });
});
```

---

## Step 9: Standard Error Response Shape

**Every API error must return the same JSON structure. No exceptions.**

```json
{
  "success": false,
  "code": "USER_NOT_FOUND",
  "message": "User not found",
  "details": null,
  "requestId": "req_abc123"
}
```

Validation error (with details):
```json
{
  "success": false,
  "code": "VALIDATION_ERROR",
  "message": "Validation failed",
  "details": [
    { "field": "email", "message": "Invalid email format" },
    { "field": "password", "message": "Must be at least 8 characters" }
  ]
}
```

---

## Quick Checklist

Before marking any code complete, verify:

- [ ] Every async function wrapped in try/catch or asyncHandler
- [ ] Custom error classes used (not raw `new Error()`)
- [ ] Global error middleware registered last in Express
- [ ] MongoDB duplicate key (11000) error handled
- [ ] Every external API call has its own try/catch with typed error
- [ ] Frontend has ErrorBoundary around major sections
- [ ] Axios interceptor normalizes all API errors
- [ ] `unhandledRejection` and `uncaughtException` registered in server.js
- [ ] Error response shape is consistent across all endpoints
- [ ] Stack traces hidden in production responses
- [ ] All errors logged with context (user id, route, body)

---

## Reference Files

- `references/custom-errors.md` — Full error class library with all HTTP codes
- `references/retry-logic.md` — Exponential backoff for external services
- `references/logging.md` — Winston logger setup for structured error logs
- `references/frontend-patterns.md` — Toast notifications, form error display, loading states
