---
name: api-contract-design
description: >
  Use this skill whenever designing, writing, or reviewing REST API endpoints. Triggers include: defining routes, writing controllers, designing response shapes, API versioning, pagination, filtering, sorting, error responses, or any mention of "API design", "endpoint", "REST", "response format", "API contract", or "frontend integration". Apply BEFORE writing any route code — inconsistent APIs break frontend and are painful to change after clients depend on them.
---

# API Contract Design Skill

## Core Philosophy

**A contract is a promise. Every endpoint must behave predictably, consistently, and versioned.**

AI API design mistakes that break frontends:
- Inconsistent response shapes (sometimes `data`, sometimes `result`, sometimes nothing)
- No versioning — breaking changes break all clients
- Inconsistent error shapes — frontend can't reliably parse errors
- No pagination on list endpoints — breaks at scale
- Mixed HTTP methods (DELETE that returns 200 vs 204)
- Nested routes deeper than 3 levels

---

## Step 1: URL Naming Conventions

```
✅ Correct patterns:
GET    /api/v1/products              → list products
POST   /api/v1/products              → create product
GET    /api/v1/products/:id          → get one product
PUT    /api/v1/products/:id          → replace product (full update)
PATCH  /api/v1/products/:id          → partial update
DELETE /api/v1/products/:id          → delete product

GET    /api/v1/products/:id/reviews  → reviews for a product
POST   /api/v1/products/:id/reviews  → add review to product

GET    /api/v1/orders/:id/items      → items in an order

❌ Wrong patterns:
GET    /api/getProducts              → verbs in URL
POST   /api/v1/createProduct         → verb in URL
GET    /api/v1/product               → singular resource name
GET    /api/v1/products/getByCategory → verb + nested resource
DELETE /api/v1/products/:id/delete   → verb at end
GET    /api/v1/user/orders/items/latest → too deep
```

Rules:
- **Plural nouns** for collections: `/products`, `/orders`, `/users`
- **No verbs** in URLs — use HTTP methods instead
- **Max 3 levels** deep: `/resource/:id/sub-resource`
- **kebab-case** for multi-word: `/discount-codes`, `/order-items`
- **Always versioned**: `/api/v1/`

---

## Step 2: Standard Response Shape

**Every response must follow this shape. No exceptions.**

```javascript
// utils/response.js

// Success response
const success = (res, data, statusCode = 200, meta = null) => {
  const body = { success: true, data };
  if (meta) body.meta = meta;
  return res.status(statusCode).json(body);
};

// List response with pagination
const list = (res, data, pagination) => {
  return res.status(200).json({
    success: true,
    data,
    meta: {
      total:       pagination.total,
      page:        pagination.page,
      limit:       pagination.limit,
      totalPages:  Math.ceil(pagination.total / pagination.limit),
      hasNextPage: pagination.page < Math.ceil(pagination.total / pagination.limit),
      hasPrevPage: pagination.page > 1
    }
  });
};

// Created response
const created = (res, data) => success(res, data, 201);

// No content (DELETE)
const noContent = (res) => res.status(204).send();

module.exports = { success, list, created, noContent };
```

Success response examples:
```json
// GET /api/v1/products/:id
{
  "success": true,
  "data": {
    "id": "abc123",
    "name": "Product Name",
    "price": 29.99
  }
}

// GET /api/v1/products (list)
{
  "success": true,
  "data": [...],
  "meta": {
    "total": 250,
    "page": 1,
    "limit": 20,
    "totalPages": 13,
    "hasNextPage": true,
    "hasPrevPage": false
  }
}

// POST /api/v1/products → 201
{
  "success": true,
  "data": { "id": "new123", ... }
}

// DELETE /api/v1/products/:id → 204
(empty body)
```

---

## Step 3: HTTP Status Code Rules

```
2xx — Success
  200 OK           → GET, PUT, PATCH success
  201 Created      → POST success (resource created)
  204 No Content   → DELETE success (no body needed)

4xx — Client Error
  400 Bad Request        → Malformed request, validation failure
  401 Unauthorized       → Not authenticated
  403 Forbidden          → Authenticated but no permission
  404 Not Found          → Resource doesn't exist
  409 Conflict           → Duplicate resource, state conflict
  422 Unprocessable      → Valid syntax, invalid semantics
  429 Too Many Requests  → Rate limit exceeded

5xx — Server Error
  500 Internal Server Error  → Unexpected server error
  503 Service Unavailable    → DB down, external service failure
```

---

## Step 4: Pagination, Filtering, Sorting

```javascript
// utils/queryBuilder.js — reusable pagination helper
const buildQuery = async (Model, queryParams, baseFilter = {}) => {
  const {
    page  = 1,
    limit = 20,
    sort  = 'createdAt',
    order = 'desc',
    search,
    ...filters
  } = queryParams;

  const skip = (page - 1) * limit;
  const sortObj = { [sort]: order === 'desc' ? -1 : 1 };

  // Build filter
  const filter = { ...baseFilter, deletedAt: null };

  // Text search
  if (search) {
    filter.$text = { $search: search };
  }

  // Apply range filters (e.g. minPrice, maxPrice)
  for (const [key, value] of Object.entries(filters)) {
    if (key.startsWith('min')) {
      const field = key.replace('min', '').toLowerCase();
      filter[field] = { ...filter[field], $gte: Number(value) };
    } else if (key.startsWith('max')) {
      const field = key.replace('max', '').toLowerCase();
      filter[field] = { ...filter[field], $lte: Number(value) };
    } else if (value !== undefined) {
      filter[key] = value;
    }
  }

  const [data, total] = await Promise.all([
    Model.find(filter).sort(sortObj).skip(skip).limit(Number(limit)),
    Model.countDocuments(filter)
  ]);

  return { data, total, page: Number(page), limit: Number(limit) };
};

// Usage in controller
exports.listProducts = asyncHandler(async (req, res) => {
  const result = await buildQuery(Product, req.query, { isActive: true });
  return listResponse(res, result.data, result);
});
```

URL examples:
```
GET /api/v1/products?page=2&limit=10
GET /api/v1/products?category=electronics&sort=price&order=asc
GET /api/v1/products?minPrice=10&maxPrice=100&search=wireless
GET /api/v1/orders?status=pending&sort=createdAt&order=desc
```

---

## Step 5: Field Selection & Population Control

```javascript
// Allow clients to request only fields they need
exports.getProduct = asyncHandler(async (req, res) => {
  const fields = req.query.fields?.split(',').join(' ') || '';
  const populate = req.query.populate?.split(',') || [];

  let query = Product.findById(req.params.id, fields);

  if (populate.includes('seller')) {
    query = query.populate('sellerId', 'name email profile.avatar');
  }
  if (populate.includes('reviews')) {
    query = query.populate({ path: 'reviews', options: { limit: 5 } });
  }

  const product = await query;
  if (!product) throw new NotFoundError('Product');

  return success(res, product);
});
```

---

## Step 6: API Versioning Strategy

```javascript
// app.js — versioned routing
const v1Routes = require('./routes/v1');
const v2Routes = require('./routes/v2');

app.use('/api/v1', v1Routes);
app.use('/api/v2', v2Routes); // When breaking changes needed

// routes/v1/index.js
const router = express.Router();
router.use('/auth',     require('./auth.routes'));
router.use('/products', require('./product.routes'));
router.use('/orders',   require('./order.routes'));
router.use('/users',    require('./user.routes'));
module.exports = router;
```

Version bump rules:
- **Patch** (bug fixes): no version change
- **Minor** (new endpoints, new optional fields): no version change
- **Major** (removed fields, changed field names, different response shape): new version

---

## Step 7: OpenAPI / Swagger Documentation

```javascript
// Install
// npm install swagger-jsdoc swagger-ui-express

// config/swagger.js
const swaggerJsdoc = require('swagger-jsdoc');

module.exports = swaggerJsdoc({
  definition: {
    openapi: '3.0.0',
    info: { title: 'MyApp API', version: '1.0.0' },
    servers: [{ url: '/api/v1' }],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }
      }
    }
  },
  apis: ['./routes/v1/*.js'] // Read JSDoc comments from route files
});

// Route JSDoc example
/**
 * @swagger
 * /products:
 *   get:
 *     summary: List products
 *     tags: [Products]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20, maximum: 100 }
 *     responses:
 *       200:
 *         description: Product list
 */
```

---

## Step 8: HATEOAS Links (Optional but Professional)

```json
// Response includes links to related actions
{
  "success": true,
  "data": {
    "id": "ord123",
    "status": "paid",
    "_links": {
      "self":   { "href": "/api/v1/orders/ord123", "method": "GET" },
      "cancel": { "href": "/api/v1/orders/ord123/cancel", "method": "POST" },
      "refund": { "href": "/api/v1/orders/ord123/refund", "method": "POST" }
    }
  }
}
```

---

## Checklist

- [ ] All routes under `/api/v1/` versioning
- [ ] Plural nouns — no verbs in URLs
- [ ] Max 3 levels of nesting
- [ ] Every success response has `{ success: true, data: ... }`
- [ ] Every list response has `meta` with pagination info
- [ ] POST returns 201, DELETE returns 204
- [ ] Consistent error shape: `{ success: false, code, message, details }`
- [ ] All list endpoints support `page`, `limit`, `sort`, `order`
- [ ] Pagination limit capped at 100
- [ ] Field names are camelCase
- [ ] Date fields return ISO 8601 strings
- [ ] IDs returned as strings (not ObjectId objects)
- [ ] Swagger/OpenAPI docs generated and served at `/api/docs`

## Reference Files
- `references/postman-collection.md` — Postman collection template
- `references/graphql-alternative.md` — When to use GraphQL instead
