# Logging Setup — Winston Structured Logger

## Setup

```bash
npm install winston winston-daily-rotate-file
```

## Logger configuration

```javascript
// utils/logger.js
const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');

const { combine, timestamp, printf, colorize, json, errors } = winston.format;

// Custom format for development — readable
const devFormat = combine(
  colorize(),
  timestamp({ format: 'HH:mm:ss' }),
  errors({ stack: true }),
  printf(({ level, message, timestamp, stack, ...meta }) => {
    let log = `${timestamp} [${level}]: ${message}`;
    if (Object.keys(meta).length) log += ` ${JSON.stringify(meta)}`;
    if (stack) log += `\n${stack}`;
    return log;
  })
);

// JSON format for production — machine parseable
const prodFormat = combine(
  timestamp(),
  errors({ stack: true }),
  json()
);

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: process.env.NODE_ENV === 'production' ? prodFormat : devFormat,
  defaultMeta: {
    service: process.env.SERVICE_NAME || 'api',
    env: process.env.NODE_ENV
  },
  transports: [
    new winston.transports.Console(),

    // Production: write to rotating files
    ...(process.env.NODE_ENV === 'production' ? [
      new DailyRotateFile({
        filename: 'logs/error-%DATE%.log',
        datePattern: 'YYYY-MM-DD',
        level: 'error',
        maxFiles: '30d',
        maxSize: '20m'
      }),
      new DailyRotateFile({
        filename: 'logs/combined-%DATE%.log',
        datePattern: 'YYYY-MM-DD',
        maxFiles: '14d',
        maxSize: '20m'
      })
    ] : [])
  ]
});

module.exports = logger;
```

## Logging patterns

```javascript
// Always include context — who, what, where
logger.error('Payment failed', {
  userId: req.user.id,
  orderId: order._id,
  amount: order.total,
  error: err.message,
  stripeCode: err.code
});

logger.warn('Low stock alert', {
  productId: product._id,
  sku: product.sku,
  currentStock: product.stock,
  threshold: 5
});

logger.info('Order created', {
  orderId: order._id,
  userId: req.user.id,
  total: order.total,
  itemCount: order.items.length
});

// Never log sensitive data
// ❌ logger.info('User login', { password: req.body.password });
// ✅ logger.info('User login', { email: req.body.email, userId: user._id });
```

## Request logging middleware

```javascript
// middleware/requestLogger.js
const logger = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');

const requestLogger = (req, res, next) => {
  const requestId = uuidv4();
  req.requestId = requestId;
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';

    logger[level]('HTTP Request', {
      requestId,
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      duration: `${duration}ms`,
      userId: req.user?.id || 'anonymous',
      ip: req.ip
    });
  });

  next();
};

module.exports = requestLogger;
```
