---
name: cicd-pipeline
description: >
  Use this skill whenever setting up CI/CD, GitHub Actions, deployment pipelines, automated testing in pipelines, Docker builds, or deployment automation. Triggers include: GitHub Actions, GitLab CI, CI/CD, pipeline, automated deploy, deployment workflow, "deploy to production", "run tests on push", "automate deployment", or any mention of continuous integration or delivery. Apply this skill to set up proper automated pipelines — manual deployments don't scale and cause inconsistent releases.
---

# CI/CD Pipeline Skill

## Core Philosophy

**Every push to main must automatically test, build, and deploy. Manual deploys are a liability.**

AI never sets up CI/CD — it just writes the app. This skill provides complete GitHub Actions pipelines for:
- Running tests on every PR
- Enforcing coverage thresholds
- Building Docker images
- Deploying to staging and production

---

## Step 1: Repository Structure

```
.github/
  workflows/
    ci.yml          ← Run on every PR: lint + test + coverage
    deploy-staging.yml   ← Auto-deploy to staging on merge to main
    deploy-prod.yml      ← Deploy to production on version tag
```

---

## Step 2: CI Workflow (Every PR)

```yaml
# .github/workflows/ci.yml
name: CI

on:
  pull_request:
    branches: [main, develop]
  push:
    branches: [main, develop]

env:
  NODE_VERSION: '20.x'

jobs:
  lint:
    name: Lint
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'
      - run: npm ci
      - run: npm run lint
      - run: npm run format:check

  test-backend:
    name: Backend Tests
    runs-on: ubuntu-latest
    needs: lint

    services:
      mongodb:
        image: mongo:7
        ports: ['27017:27017']
        options: >-
          --health-cmd "mongosh --eval 'db.runCommand({ping:1})'"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

      redis:
        image: redis:7-alpine
        ports: ['6379:6379']
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    env:
      NODE_ENV:            test
      MONGODB_URI:         mongodb://localhost:27017/testdb
      REDIS_URL:           redis://localhost:6379
      JWT_ACCESS_SECRET:   test-access-secret-min-32-chars-long
      JWT_REFRESH_SECRET:  test-refresh-secret-min-32-chars-long
      STRIPE_SECRET_KEY:   sk_test_placeholder
      STRIPE_WEBHOOK_SECRET: whsec_placeholder
      AWS_ACCESS_KEY_ID:   test-key
      AWS_SECRET_ACCESS_KEY: test-secret
      AWS_REGION:          us-east-1
      S3_BUCKET:           test-bucket
      SMTP_HOST:           localhost
      SMTP_PORT:           '1025'
      SMTP_USER:           test
      SMTP_PASS:           test
      EMAIL_FROM:          test@test.com
      FRONTEND_URL:        http://localhost:3000

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'
      - run: npm ci

      - name: Run unit tests
        run: npm run test:unit -- --coverage

      - name: Run integration tests
        run: npm run test:integration

      - name: Check coverage threshold
        run: npm run test:coverage-check

      - name: Upload coverage report
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: backend-coverage
          path: coverage/

      - name: Coverage summary comment
        uses: davelosert/vitest-coverage-report-action@v2
        if: github.event_name == 'pull_request'
        with:
          json-summary-path: coverage/coverage-summary.json

  test-frontend:
    name: Frontend Tests
    runs-on: ubuntu-latest
    needs: lint

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'
          cache-dependency-path: client/package-lock.json
      - run: npm ci
        working-directory: client
      - run: npm run test -- --coverage
        working-directory: client
      - run: npm run build
        working-directory: client

  e2e:
    name: E2E Tests
    runs-on: ubuntu-latest
    needs: [test-backend, test-frontend]

    services:
      mongodb:
        image: mongo:7
        ports: ['27017:27017']

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'
      - run: npm ci

      - name: Start backend
        run: npm run start:test &
        env:
          NODE_ENV: test
          MONGODB_URI: mongodb://localhost:27017/e2edb
          JWT_ACCESS_SECRET: test-secret-32-chars-minimum-length

      - name: Wait for backend
        run: npx wait-on http://localhost:5000/api/health --timeout 30000

      - name: Seed test data
        run: npm run seed:test

      - name: Run Cypress E2E
        uses: cypress-io/github-action@v6
        with:
          working-directory: client
          start: npm run start
          wait-on: 'http://localhost:3000'
          browser: chrome
          record: false

      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: cypress-screenshots
          path: client/cypress/screenshots/
```

---

## Step 3: Deploy to Staging (Auto on main merge)

```yaml
# .github/workflows/deploy-staging.yml
name: Deploy Staging

on:
  push:
    branches: [main]

jobs:
  deploy:
    name: Deploy to Staging
    runs-on: ubuntu-latest
    environment: staging

    steps:
      - uses: actions/checkout@v4

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id:     ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region:            ${{ secrets.AWS_REGION }}

      - name: Login to ECR
        id: login-ecr
        uses: aws-actions/amazon-ecr-login@v2

      - name: Build and push Docker image
        env:
          ECR_REGISTRY:   ${{ steps.login-ecr.outputs.registry }}
          ECR_REPOSITORY: myapp-api
          IMAGE_TAG:      ${{ github.sha }}
        run: |
          docker build -t $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG .
          docker tag  $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG \
                      $ECR_REGISTRY/$ECR_REPOSITORY:staging-latest
          docker push $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG
          docker push $ECR_REGISTRY/$ECR_REPOSITORY:staging-latest

      - name: Deploy to ECS
        run: |
          aws ecs update-service \
            --cluster myapp-staging \
            --service myapp-api \
            --force-new-deployment

      - name: Wait for deployment
        run: |
          aws ecs wait services-stable \
            --cluster myapp-staging \
            --services myapp-api

      - name: Run smoke tests
        run: |
          curl -f https://staging.myapp.com/api/health || exit 1

      - name: Notify Slack
        if: always()
        uses: slackapi/slack-github-action@v1.26.0
        with:
          payload: |
            {
              "text": "Staging deploy ${{ job.status }}: ${{ github.sha }}"
            }
        env:
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}
```

---

## Step 4: Deploy to Production (On version tag)

```yaml
# .github/workflows/deploy-prod.yml
name: Deploy Production

on:
  push:
    tags: ['v*.*.*']   # Triggers on: git tag v1.2.3 && git push --tags

jobs:
  deploy:
    name: Deploy to Production
    runs-on: ubuntu-latest
    environment: production    # Requires manual approval in GitHub

    steps:
      - uses: actions/checkout@v4

      - name: Extract version
        id: version
        run: echo "VERSION=${GITHUB_REF#refs/tags/}" >> $GITHUB_OUTPUT

      - name: Configure AWS
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id:     ${{ secrets.AWS_ACCESS_KEY_ID_PROD }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY_PROD }}
          aws-region:            ${{ secrets.AWS_REGION }}

      - name: Login to ECR
        id: login-ecr
        uses: aws-actions/amazon-ecr-login@v2

      - name: Build and push
        env:
          ECR_REGISTRY:   ${{ steps.login-ecr.outputs.registry }}
          ECR_REPOSITORY: myapp-api
          VERSION:        ${{ steps.version.outputs.VERSION }}
        run: |
          docker build -t $ECR_REGISTRY/$ECR_REPOSITORY:$VERSION .
          docker tag  $ECR_REGISTRY/$ECR_REPOSITORY:$VERSION \
                      $ECR_REGISTRY/$ECR_REPOSITORY:latest
          docker push $ECR_REGISTRY/$ECR_REPOSITORY:$VERSION
          docker push $ECR_REGISTRY/$ECR_REPOSITORY:latest

      - name: Deploy to ECS production
        run: |
          aws ecs update-service \
            --cluster myapp-production \
            --service myapp-api \
            --force-new-deployment

      - name: Verify deployment
        run: |
          aws ecs wait services-stable --cluster myapp-production --services myapp-api
          curl -f https://myapp.com/api/health || exit 1

      - name: Create GitHub Release
        uses: actions/create-release@v1
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          tag_name:    ${{ steps.version.outputs.VERSION }}
          release_name: Release ${{ steps.version.outputs.VERSION }}
          draft: false
          prerelease: false
```

---

## Step 5: Jest Coverage Config

```javascript
// jest.config.js
module.exports = {
  testEnvironment: 'node',
  coverageThreshold: {
    global: {
      branches:   80,
      functions:  80,
      lines:      80,
      statements: 80
    }
  },
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/server.js',
    '!src/config/**',
    '!src/**/*.test.js'
  ],
  testMatch: ['**/__tests__/**/*.js', '**/*.test.js'],
  setupFilesAfterFramework: ['./tests/setup.js']
};
```

---

## Step 6: Health Check Endpoint

```javascript
// routes/health.routes.js — required for deployment smoke tests
const mongoose = require('mongoose');
const redis    = require('../config/redis');

router.get('/health', async (req, res) => {
  const dbState = mongoose.connection.readyState === 1 ? 'ok' : 'error';
  let cacheState = 'ok';
  try { await redis.ping(); } catch { cacheState = 'error'; }

  const status = dbState === 'ok' && cacheState === 'ok' ? 200 : 503;
  res.status(status).json({
    status: status === 200 ? 'healthy' : 'degraded',
    version: process.env.npm_package_version,
    db: dbState,
    cache: cacheState,
    uptime: process.uptime()
  });
});
```

---

## Checklist

- [ ] `ci.yml` runs on every PR to main
- [ ] Lint, unit tests, integration tests, E2E all in pipeline
- [ ] MongoDB and Redis services in CI environment
- [ ] Coverage threshold enforced (80% minimum)
- [ ] Coverage report posted as PR comment
- [ ] Staging auto-deploys on merge to main
- [ ] Production deploys only on version tags
- [ ] Production environment requires manual approval in GitHub
- [ ] Docker image tagged with git SHA for traceability
- [ ] Health check endpoint used in smoke test after deploy
- [ ] Slack/email notification on deploy success/failure
- [ ] All secrets stored in GitHub Secrets — never in YAML files
- [ ] E2E screenshots uploaded on failure for debugging

## Reference Files
- `references/dockerfile.md` — Production-ready Dockerfile
- `references/docker-compose.md` — Local dev docker-compose setup
