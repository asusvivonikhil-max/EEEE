---
name: environment-config
description: >
  Use this skill whenever setting up a project, writing configuration code, using API keys, database URIs, secrets, or environment variables. Triggers include: .env files, process.env, config setup, database connection strings, JWT secrets, API keys (Stripe, AWS, Twilio, SendGrid), port numbers, CORS origins, NODE_ENV, or any hardcoded value that differs between dev/staging/production. Also trigger when user says "set up config", "environment variables", "secrets", "configure the app", or "connect to database". CRITICAL: Never let AI hardcode secrets — this skill prevents the #1 cause of secret leaks to GitHub. Apply proactively on every new project.
---

# Environment Config Skill

## Core Philosophy

**Secrets in code = public secrets. Configuration must be external, validated, and environment-specific.**

AI constantly makes these mistakes:
- Hardcodes API keys directly in source files
- Uses same config for dev/staging/production
- Never validates that required env vars exist at startup
- Commits `.env` to git
- Uses `process.env.X` scattered across codebase with no type safety

---

## Step 1: .gitignore First — Before Anything Else

```gitignore
# .gitignore — add BEFORE first commit
.env
.env.local
.env.development.local
.env.test.local
.env.production.local
.env.*
!.env.example    # Keep the example file — no real values

# Never commit these either
*.pem
*.key
*.cert
secrets/
config/local.js
```

---

## Step 2: .env.example — Template with Descriptions

**Commit this file. Contains keys but NO real values.**

```env
# .env.example — copy to .env and fill in real values

# ── Server ──────────────────────────────────────────
NODE_ENV=development          # development | staging | production
PORT=5000
FRONTEND_URL=http://localhost:3000

# ── Database ─────────────────────────────────────────
MONGODB_URI=mongodb://localhost:27017/myapp_dev
MONGODB_URI_TEST=mongodb://localhost:27017/myapp_test
REDIS_URL=redis://localhost:6379

# ── Authentication ────────────────────────────────────
# Generate with: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
JWT_ACCESS_SECRET=REPLACE_WITH_64_CHAR_RANDOM_STRING
JWT_REFRESH_SECRET=REPLACE_WITH_DIFFERENT_64_CHAR_RANDOM_STRING

# ── Payments ──────────────────────────────────────────
STRIPE_SECRET_KEY=sk_test_REPLACE_ME
STRIPE_WEBHOOK_SECRET=whsec_REPLACE_ME
PAYPAL_CLIENT_ID=REPLACE_ME
PAYPAL_CLIENT_SECRET=REPLACE_ME

# ── Storage ───────────────────────────────────────────
AWS_ACCESS_KEY_ID=REPLACE_ME
AWS_SECRET_ACCESS_KEY=REPLACE_ME
AWS_REGION=us-east-1
S3_BUCKET=myapp-uploads-dev

# ── Email ─────────────────────────────────────────────
SMTP_HOST=smtp.mailtrap.io
SMTP_PORT=587
SMTP_USER=REPLACE_ME
SMTP_PASS=REPLACE_ME
EMAIL_FROM=noreply@myapp.com

# ── Third-party ───────────────────────────────────────
GOOGLE_CLIENT_ID=REPLACE_ME
GOOGLE_CLIENT_SECRET=REPLACE_ME
TWILIO_ACCOUNT_SID=REPLACE_ME
TWILIO_AUTH_TOKEN=REPLACE_ME
TWILIO_PHONE=+1REPLACE_ME

# ── Rate Limiting ─────────────────────────────────────
RATE_LIMIT_WINDOW_MS=900000   # 15 minutes
RATE_LIMIT_MAX=100

# ── Logging ───────────────────────────────────────────
LOG_LEVEL=debug               # debug | info | warn | error
SERVICE_NAME=api
```

---

## Step 3: Config Module — Single Source of Truth

**Never use `process.env.X` directly in application code. Always go through config.**

```javascript
// config/index.js
const { z } = require('zod');

// Schema defines ALL required env vars and their types
const envSchema = z.object({
  // Server
  NODE_ENV:      z.enum(['development', 'test', 'staging', 'production']).default('development'),
  PORT:          z.coerce.number().int().positive().default(5000),
  FRONTEND_URL:  z.string().url(),

  // Database
  MONGODB_URI:   z.string().min(1, 'MongoDB URI required'),
  REDIS_URL:     z.string().default('redis://localhost:6379'),

  // Auth — must be long enough to be secure
  JWT_ACCESS_SECRET:  z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 chars'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 chars'),

  // Stripe
  STRIPE_SECRET_KEY:      z.string().startsWith('sk_'),
  STRIPE_WEBHOOK_SECRET:  z.string().startsWith('whsec_'),

  // AWS
  AWS_ACCESS_KEY_ID:     z.string().min(16),
  AWS_SECRET_ACCESS_KEY: z.string().min(1),
  AWS_REGION:            z.string().default('us-east-1'),
  S3_BUCKET:             z.string().min(1),

  // Email
  SMTP_HOST:  z.string().min(1),
  SMTP_PORT:  z.coerce.number().default(587),
  SMTP_USER:  z.string().min(1),
  SMTP_PASS:  z.string().min(1),
  EMAIL_FROM: z.string().email(),

  // Optional
  GOOGLE_CLIENT_ID:     z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  RATE_LIMIT_MAX: z.coerce.number().default(100),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(900000),
});

// Parse and validate at startup — crash immediately if invalid
const parseResult = envSchema.safeParse(process.env);

if (!parseResult.success) {
  const missing = parseResult.error.errors.map(e => `  ✗ ${e.path[0]}: ${e.message}`).join('\n');
  console.error('\n❌ Invalid environment configuration:\n' + missing + '\n');
  console.error('Copy .env.example to .env and fill in all required values.\n');
  process.exit(1); // Crash loud and early
}

const env = parseResult.data;

// Export structured config — organized by domain
module.exports = {
  env:    env.NODE_ENV,
  isDev:  env.NODE_ENV === 'development',
  isProd: env.NODE_ENV === 'production',
  isTest: env.NODE_ENV === 'test',

  server: {
    port:        env.PORT,
    frontendUrl: env.FRONTEND_URL,
  },

  db: {
    mongoUri: env.MONGODB_URI,
    redisUrl: env.REDIS_URL,
  },

  auth: {
    accessSecret:  env.JWT_ACCESS_SECRET,
    refreshSecret: env.JWT_REFRESH_SECRET,
  },

  stripe: {
    secretKey:     env.STRIPE_SECRET_KEY,
    webhookSecret: env.STRIPE_WEBHOOK_SECRET,
  },

  aws: {
    accessKeyId:     env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    region:          env.AWS_REGION,
    s3Bucket:        env.S3_BUCKET,
  },

  email: {
    host:  env.SMTP_HOST,
    port:  env.SMTP_PORT,
    user:  env.SMTP_USER,
    pass:  env.SMTP_PASS,
    from:  env.EMAIL_FROM,
  },

  google: {
    clientId:     env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
  },

  rateLimit: {
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    max:      env.RATE_LIMIT_MAX,
  },

  logging: {
    level:   env.LOG_LEVEL,
    service: env.SERVICE_NAME || 'api',
  },
};
```

---

## Step 4: Load .env in Entry Point Only

```javascript
// server.js — ONLY file that calls dotenv
require('dotenv').config(); // Must be FIRST line
const config = require('./config'); // Validates immediately after
const app = require('./app');

const server = app.listen(config.server.port, () => {
  console.log(`✅ Server running on port ${config.server.port} [${config.env}]`);
});

module.exports = server;
```

**All other files import from config, never from dotenv or process.env:**
```javascript
// services/stripeService.js
const config = require('../config'); // ✅ correct
const stripe = require('stripe')(config.stripe.secretKey);

// ❌ Never do this in service files:
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const stripe = require('stripe')('sk_live_abc123'); // hardcoded = instant breach
```

---

## Step 5: Per-Environment Config Files

```javascript
// config/environments/development.js
module.exports = {
  logLevel: 'debug',
  dbDebug:  true,
  emailProvider: 'mailtrap', // Never send real emails in dev
  stripeMode: 'test',
};

// config/environments/production.js
module.exports = {
  logLevel: 'warn',
  dbDebug:  false,
  emailProvider: 'sendgrid',
  stripeMode: 'live',
  trustProxy: true, // Behind load balancer
};

// config/environments/test.js
module.exports = {
  logLevel: 'error', // Suppress noise during tests
  emailProvider: 'mock',
  stripeMode: 'mock',
};
```

---

## Step 6: Database Connection with Config

```javascript
// config/database.js
const mongoose = require('mongoose');
const config = require('./index');
const logger = require('../utils/logger');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(config.db.mongoUri, {
      maxPoolSize: config.isProd ? 10 : 5,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    logger.info(`MongoDB connected: ${conn.connection.host}`);
  } catch (err) {
    logger.error('MongoDB connection failed', { error: err.message });
    process.exit(1);
  }
};

// Reconnect on disconnect
mongoose.connection.on('disconnected', () => {
  logger.warn('MongoDB disconnected — reconnecting...');
  setTimeout(connectDB, 5000);
});

module.exports = { connectDB };
```

---

## Step 7: Production Secrets Management

For production, **never use .env files on servers**. Use:

| Platform | Service |
|---|---|
| AWS | Secrets Manager or Parameter Store |
| GCP | Secret Manager |
| Vercel / Railway | Dashboard environment variables |
| Docker / K8s | Kubernetes Secrets or Vault |
| Self-hosted | HashiCorp Vault |

```javascript
// config/secrets.js — AWS Secrets Manager example
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');

const loadProductionSecrets = async () => {
  if (process.env.NODE_ENV !== 'production') return;

  const client = new SecretsManagerClient({ region: process.env.AWS_REGION });
  const { SecretString } = await client.send(
    new GetSecretValueCommand({ SecretId: 'myapp/production' })
  );
  const secrets = JSON.parse(SecretString);

  // Inject into process.env before config parses
  Object.assign(process.env, secrets);
};

module.exports = { loadProductionSecrets };
```

---

## Checklist

- [ ] `.env` is in `.gitignore` — check with `git status`
- [ ] `.env.example` committed with all keys, no real values
- [ ] All env vars validated at startup with Zod schema
- [ ] App crashes immediately on missing/invalid config (fail fast)
- [ ] `dotenv.config()` only in `server.js` entry point
- [ ] All other files import from `config/index.js` — never `process.env`
- [ ] No secrets hardcoded anywhere — search codebase: `grep -r "sk_live\|sk_test\|AKIA" src/`
- [ ] JWT secrets are ≥ 64 random characters
- [ ] Different DB URIs for dev, test, production
- [ ] Production uses cloud secrets manager, not `.env` file
- [ ] `config/index.js` is organized by domain (db, auth, stripe, etc.)

## Reference Files
- `references/docker-env.md` — Docker and docker-compose env var patterns
- `references/ci-secrets.md` — GitHub Actions secrets injection
