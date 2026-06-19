# Retry Logic — Exponential Backoff for External Services

## Core retry utility

```javascript
// utils/retry.js

const logger = require('./logger');

/**
 * Retry an async function with exponential backoff
 * @param {Function} fn - Async function to retry
 * @param {Object} options
 * @param {number} options.maxRetries - Max attempts (default: 3)
 * @param {number} options.baseDelay - Initial delay in ms (default: 500)
 * @param {number} options.maxDelay - Maximum delay in ms (default: 10000)
 * @param {Function} options.shouldRetry - Custom function to decide retry
 */
const withRetry = async (fn, options = {}) => {
  const {
    maxRetries = 3,
    baseDelay = 500,
    maxDelay = 10000,
    shouldRetry = defaultShouldRetry,
    context = 'operation'
  } = options;

  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      if (attempt === maxRetries || !shouldRetry(err)) {
        logger.error(`${context} failed after ${attempt} attempts`, {
          error: err.message,
          attempts: attempt
        });
        throw err;
      }

      const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay);
      const jitter = Math.random() * 200; // Prevent thundering herd
      const waitTime = delay + jitter;

      logger.warn(`${context} failed, retrying in ${Math.round(waitTime)}ms`, {
        attempt,
        maxRetries,
        error: err.message
      });

      await sleep(waitTime);
    }
  }

  throw lastError;
};

// Default: retry on network/server errors, not client errors
const defaultShouldRetry = (err) => {
  // Don't retry client errors (4xx)
  if (err.statusCode >= 400 && err.statusCode < 500) return false;
  if (err.type === 'StripeCardError') return false;
  if (err.type === 'StripeInvalidRequestError') return false;
  // Retry on timeouts, network errors, 5xx
  return true;
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

module.exports = { withRetry };
```

## Usage Examples

### Stripe with retry
```javascript
const { withRetry } = require('../utils/retry');

const chargeCustomer = async (paymentIntentId) => {
  return withRetry(
    () => stripe.paymentIntents.confirm(paymentIntentId),
    {
      maxRetries: 3,
      baseDelay: 1000,
      context: 'Stripe payment confirm',
      shouldRetry: (err) => err.type === 'StripeConnectionError' || err.type === 'StripeAPIError'
    }
  );
};
```

### Email with retry
```javascript
const sendEmail = async (to, subject, html) => {
  return withRetry(
    () => transporter.sendMail({ to, subject, html }),
    { maxRetries: 3, baseDelay: 2000, context: 'Email send' }
  );
};
```

### S3 upload with retry
```javascript
const uploadFile = async (key, buffer) => {
  return withRetry(
    () => s3Client.send(new PutObjectCommand({ Bucket, Key: key, Body: buffer })),
    { maxRetries: 3, baseDelay: 500, context: 'S3 upload' }
  );
};
```

## Circuit Breaker Pattern (advanced)

For services that fail repeatedly, use a circuit breaker to stop hammering them:

```javascript
// utils/circuitBreaker.js
class CircuitBreaker {
  constructor(fn, options = {}) {
    this.fn = fn;
    this.failureThreshold = options.failureThreshold || 5;
    this.successThreshold = options.successThreshold || 2;
    this.timeout = options.timeout || 30000; // 30s open state
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.failureCount = 0;
    this.successCount = 0;
    this.nextAttempt = Date.now();
  }

  async call(...args) {
    if (this.state === 'OPEN') {
      if (Date.now() < this.nextAttempt) {
        throw new ExternalServiceError('Circuit breaker open — service unavailable');
      }
      this.state = 'HALF_OPEN';
    }

    try {
      const result = await this.fn(...args);
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }

  onSuccess() {
    this.failureCount = 0;
    if (this.state === 'HALF_OPEN') {
      this.successCount++;
      if (this.successCount >= this.successThreshold) {
        this.state = 'CLOSED';
        this.successCount = 0;
      }
    }
  }

  onFailure() {
    this.failureCount++;
    if (this.failureCount >= this.failureThreshold) {
      this.state = 'OPEN';
      this.nextAttempt = Date.now() + this.timeout;
    }
  }
}

// Usage
const stripeBreaker = new CircuitBreaker(
  (amount) => stripe.paymentIntents.create({ amount }),
  { failureThreshold: 3, timeout: 60000 }
);
```
