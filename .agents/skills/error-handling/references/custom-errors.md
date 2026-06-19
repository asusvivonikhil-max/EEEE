# Custom Error Classes — Full Library

## Complete AppError hierarchy

```javascript
// errors/index.js — export all from one place

class AppError extends Error {
  constructor(message, statusCode, code, details = null) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
    this.timestamp = new Date().toISOString();
    Error.captureStackTrace(this, this.constructor);
  }
}

// 400 — Bad Request
class ValidationError extends AppError {
  constructor(details) {
    super('Validation failed', 400, 'VALIDATION_ERROR', details);
  }
}

class BadRequestError extends AppError {
  constructor(message, code = 'BAD_REQUEST') {
    super(message, 400, code);
  }
}

// 401 — Unauthorized
class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

class TokenExpiredError extends AppError {
  constructor() {
    super('Token has expired', 401, 'TOKEN_EXPIRED');
  }
}

class InvalidTokenError extends AppError {
  constructor() {
    super('Invalid token', 401, 'INVALID_TOKEN');
  }
}

// 403 — Forbidden
class ForbiddenError extends AppError {
  constructor(message = 'Access denied') {
    super(message, 403, 'FORBIDDEN');
  }
}

class InsufficientPermissionsError extends AppError {
  constructor(requiredRole) {
    super(`Requires ${requiredRole} role`, 403, 'INSUFFICIENT_PERMISSIONS');
    this.requiredRole = requiredRole;
  }
}

// 404 — Not Found
class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, 404, 'NOT_FOUND');
    this.resource = resource;
  }
}

// 409 — Conflict
class ConflictError extends AppError {
  constructor(message, field = null) {
    super(message, 409, 'CONFLICT');
    this.field = field;
  }
}

class DuplicateError extends AppError {
  constructor(field) {
    super(`${field} already exists`, 409, 'DUPLICATE');
    this.field = field;
  }
}

// 410 — Gone (resource permanently deleted)
class GoneError extends AppError {
  constructor(resource) {
    super(`${resource} has been permanently deleted`, 410, 'GONE');
  }
}

// 422 — Unprocessable Entity
class UnprocessableError extends AppError {
  constructor(message, details = null) {
    super(message, 422, 'UNPROCESSABLE', details);
  }
}

// 429 — Too Many Requests
class RateLimitError extends AppError {
  constructor(retryAfter = 60) {
    super('Too many requests', 429, 'RATE_LIMIT_EXCEEDED');
    this.retryAfter = retryAfter;
  }
}

// 503 — Service Unavailable
class ExternalServiceError extends AppError {
  constructor(service, originalError = null) {
    super(`${service} is temporarily unavailable`, 503, 'EXTERNAL_SERVICE_ERROR');
    this.service = service;
    this.originalError = originalError?.message || null;
  }
}

class DatabaseError extends AppError {
  constructor(message = 'Database operation failed') {
    super(message, 503, 'DATABASE_ERROR');
  }
}

// Payment specific
class PaymentError extends AppError {
  constructor(message, code = 'PAYMENT_FAILED') {
    super(message, 400, code);
  }
}

class InsufficientFundsError extends AppError {
  constructor() {
    super('Insufficient funds', 400, 'INSUFFICIENT_FUNDS');
  }
}

class PaymentDeclinedError extends AppError {
  constructor(reason = 'Card declined') {
    super(reason, 400, 'PAYMENT_DECLINED');
  }
}

// File upload specific
class FileTooLargeError extends AppError {
  constructor(maxSize) {
    super(`File exceeds maximum size of ${maxSize}`, 400, 'FILE_TOO_LARGE');
  }
}

class InvalidFileTypeError extends AppError {
  constructor(allowed) {
    super(`Invalid file type. Allowed: ${allowed.join(', ')}`, 400, 'INVALID_FILE_TYPE');
    this.allowedTypes = allowed;
  }
}

module.exports = {
  AppError,
  ValidationError, BadRequestError,
  UnauthorizedError, TokenExpiredError, InvalidTokenError,
  ForbiddenError, InsufficientPermissionsError,
  NotFoundError,
  ConflictError, DuplicateError,
  GoneError,
  UnprocessableError,
  RateLimitError,
  ExternalServiceError, DatabaseError,
  PaymentError, InsufficientFundsError, PaymentDeclinedError,
  FileTooLargeError, InvalidFileTypeError
};
```

## HTTP Status Code Reference

| Code | Name | When to use |
|---|---|---|
| 400 | Bad Request | Malformed request, validation failure |
| 401 | Unauthorized | Not authenticated, token missing/expired |
| 403 | Forbidden | Authenticated but no permission |
| 404 | Not Found | Resource doesn't exist |
| 409 | Conflict | Duplicate resource, state conflict |
| 410 | Gone | Resource permanently deleted |
| 422 | Unprocessable | Valid syntax but semantic error |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Unexpected programmer error |
| 503 | Service Unavailable | DB down, external service failure |
