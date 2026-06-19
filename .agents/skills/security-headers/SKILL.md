---
name: security-headers
description: >
  Use this skill whenever setting up an Express application, configuring middleware, or hardening a web application for production. Triggers include: Express app setup, middleware configuration, CORS, Helmet, rate limiting, production deployment, or any mention of "security", "protect", "harden", "CORS error", "headers", or "DDoS protection". Apply this skill to every new Express app setup — security headers are the last defense layer and AI never adds them without being explicitly told.
---

# Security Headers Skill

## Core Philosophy

**Default Express is insecure. Every production app needs defense-in-depth headers.**

AI writes Express apps that expose server info, allow any origin, and have no rate limiting. This skill locks everything down.

---

## Step 1: Install Dependencies

```bash
npm install helmet cors express-rate-limit express-mongo-sanitize hpp xss-clean
```

---

## Step 2: Complete Security Middleware Stack

```javascript
// middleware/security.js
const helmet     = require('helmet');
const cors       = require('cors');
const rateLimit  = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const xss        = require('xss-clean');
const hpp        = require('hpp');
const config     = require('../config');

// ── 1. Helmet — sets 11 security headers at once ──────────────
const helmetConfig = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:  ["'self'"],
      scriptSrc:   ["'self'", "'unsafe-inline'", 'https://js.stripe.com'],
      styleSrc:    ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc:     ["'self'", 'https://fonts.gstatic.com'],
      imgSrc:      ["'self'", 'data:', 'https:', `https://${config.aws.s3Bucket}.s3.amazonaws.com`],
      connectSrc:  ["'self'", 'https://api.stripe.com'],
      frameSrc:    ["'self'", 'https://js.stripe.com'],
      objectSrc:   ["'none'"],
      upgradeInsecureRequests: config.isProd ? [] : null
    }
  },
  crossOriginEmbedderPolicy: false, // Required for Stripe
  hsts: {
    maxAge:            31536000,     // 1 year
    includeSubDomains: true,
    preload:           true
  }
});

// ── 2. CORS — only allow your frontend ────────────────────────
const corsConfig = cors({
  origin: (origin, callback) => {
    const allowed = [
      config.server.frontendUrl,
      ...(config.isDev ? ['http://localhost:3000', 'http://localhost:5173'] : [])
    ];
    // Allow no origin (mobile apps, Postman) in development
    if (!origin && config.isDev) return callback(null, true);
    if (allowed.includes(origin)) return callback(null, true);
    callback(new Error(`CORS: Origin ${origin} not allowed`));
  },
  credentials:     true,     // Allow cookies
  methods:         ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders:  ['Content-Type', 'Authorization', 'X-Request-ID'],
  exposedHeaders:  ['X-Total-Count', 'X-Page-Count'],
  maxAge:          86400      // Cache preflight for 24 hours
});

// ── 3. Rate Limiters — different limits for different routes ──
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max:      config.rateLimit.max, // 100 requests
  standardHeaders: true,
  legacyHeaders:   false,
  message: { success: false, code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests, please try again later.' },
  skip: (req) => config.isDev && req.ip === '127.0.0.1' // Skip in local dev
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      10,              // Strict: 10 login attempts per 15 min
  standardHeaders: true,
  message:  { success: false, code: 'AUTH_RATE_LIMIT', message: 'Too many auth attempts. Try again in 15 minutes.' },
  skipSuccessfulRequests: true // Don't count successful logins
});

const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max:      3,               // 3 password reset attempts per hour
  message:  { success: false, code: 'RATE_LIMIT_EXCEEDED', message: 'Too many password reset attempts.' }
});

// ── 4. NoSQL Injection Prevention ────────────────────────────
const noSQLSanitize = mongoSanitize({
  replaceWith: '_',    // Replace $ and . in keys
  onSanitize: ({ req, key }) => {
    console.warn(`NoSQL injection attempt detected: ${key} from ${req.ip}`);
  }
});

// ── 5. XSS Protection ────────────────────────────────────────
// xss-clean sanitizes req.body, req.query, req.params

// ── 6. HTTP Parameter Pollution ──────────────────────────────
const hppConfig = hpp({
  whitelist: ['sort', 'fields', 'page', 'limit'] // These can be arrays
});

module.exports = {
  helmetConfig,
  corsConfig,
  generalLimiter,
  authLimiter,
  passwordResetLimiter,
  noSQLSanitize,
  hppConfig
};
```

---

## Step 3: Apply in app.js

```javascript
// app.js — security middleware order matters
const express = require('express');
const {
  helmetConfig, corsConfig, generalLimiter,
  authLimiter, passwordResetLimiter,
  noSQLSanitize, hppConfig
} = require('./middleware/security');

const app = express();

// ── Security — apply first, before routes ─────────────────────
app.use(helmetConfig);          // Security headers
app.use(corsConfig);            // CORS
app.set('trust proxy', 1);      // Trust first proxy (for rate limiter behind nginx/LB)

// ── Body parsers ──────────────────────────────────────────────
// Webhook route uses raw body — must be before express.json()
app.use('/api/webhooks', webhookRoutes);

app.use(express.json({ limit: '10kb' }));   // Limit body size
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// ── Data sanitization ─────────────────────────────────────────
app.use(noSQLSanitize);         // Prevent NoSQL injection
app.use(xss());                 // Prevent XSS
app.use(hppConfig);             // Prevent HTTP param pollution

// ── Rate limiting ─────────────────────────────────────────────
app.use('/api', generalLimiter);
app.use('/api/v1/auth/login',          authLimiter);
app.use('/api/v1/auth/register',       authLimiter);
app.use('/api/v1/auth/forgot-password', passwordResetLimiter);

// ── Request ID (for log tracing) ──────────────────────────────
app.use((req, res, next) => {
  req.id = require('crypto').randomUUID();
  res.setHeader('X-Request-ID', req.id);
  next();
});

// ── Routes ────────────────────────────────────────────────────
app.use('/api/v1', apiRoutes);

// ── Prevent server info leakage ───────────────────────────────
app.disable('x-powered-by'); // Helmet does this too, belt+suspenders

module.exports = app;
```

---

## Step 4: What Helmet Adds Automatically

| Header | Protection against |
|---|---|
| `X-DNS-Prefetch-Control: off` | DNS prefetch info leakage |
| `X-Frame-Options: SAMEORIGIN` | Clickjacking |
| `X-Content-Type-Options: nosniff` | MIME type sniffing |
| `Referrer-Policy: no-referrer` | URL info leakage |
| `X-XSS-Protection: 0` | Old XSS filter (disabled — CSP is better) |
| `Strict-Transport-Security` | Forces HTTPS (HSTS) |
| `Content-Security-Policy` | XSS, data injection |
| `Cross-Origin-Opener-Policy` | Cross-origin attacks |
| `Cross-Origin-Resource-Policy` | Resource leakage |
| `Origin-Agent-Cluster` | Process isolation |
| `Permissions-Policy` | Browser feature access |

---

## Step 5: Nginx Security Headers (Production)

```nginx
# nginx.conf — add these in your server block
server {
    # Force HTTPS
    listen 443 ssl http2;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Additional headers beyond what Helmet sets
    add_header X-Robots-Tag "noindex, nofollow" always;  # If private app
    add_header X-Permitted-Cross-Domain-Policies "none" always;

    # Rate limiting at nginx level (before app)
    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
    limit_req zone=api burst=20 nodelay;

    # Hide nginx version
    server_tokens off;

    # Proxy to Node app
    location /api {
        proxy_pass http://localhost:5000;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# Redirect HTTP to HTTPS
server {
    listen 80;
    return 301 https://$host$request_uri;
}
```

---

## Step 6: Security Audit Script

```bash
# package.json
"scripts": {
  "audit":        "npm audit --audit-level=high",
  "audit:fix":    "npm audit fix",
  "check-secrets": "grep -rn 'sk_live\\|sk_test\\|AKIA\\|password.*=.*[\"\\x27][A-Za-z0-9]' src/ --include='*.js' || echo 'No hardcoded secrets found'"
}
```

---

## Checklist

- [ ] `helmet()` applied as first middleware in app.js
- [ ] `app.disable('x-powered-by')` set
- [ ] CORS configured with explicit origin whitelist — not `*`
- [ ] `credentials: true` set in CORS for cookie auth
- [ ] General rate limiter on all `/api` routes
- [ ] Strict auth rate limiter on login/register (max 10/15min)
- [ ] Password reset rate limiter (max 3/hour)
- [ ] `express.json({ limit: '10kb' })` to prevent large payload attacks
- [ ] `express-mongo-sanitize` prevents NoSQL injection
- [ ] `xss-clean` sanitizes request data
- [ ] `hpp` prevents HTTP parameter pollution
- [ ] `trust proxy` set if behind nginx/load balancer
- [ ] Nginx redirects HTTP → HTTPS
- [ ] `npm audit` runs in CI pipeline
- [ ] No secrets hardcoded — `check-secrets` script passes
- [ ] HSTS header set with `preload: true`

## Reference Files
- `references/owasp-top10.md` — OWASP Top 10 checklist for web apps
- `references/ssl-setup.md` — Let's Encrypt SSL certificate setup
