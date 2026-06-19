---
name: input-validation
description: >
  Use this skill whenever writing any API endpoint, form handler, file upload, query parameter, or any code that receives data from outside the application. Triggers include: POST/PUT/PATCH routes, req.body, req.query, req.params, file uploads, search filters, user registration, login, checkout, or any user-submitted data. Also trigger when user says "validate input", "sanitize data", "form validation", "prevent injection", or "check user data". NEVER skip this skill — missing server-side validation is the #1 cause of security vulnerabilities. Frontend validation is UX only; server-side validation is security. Always apply even if user doesn't mention it.
---

# Input Validation Skill

## Core Philosophy

**Never trust any input. Validate everything on the server, always.**

- Frontend validation = UX convenience (can be bypassed in 10 seconds)
- Server-side validation = security requirement (cannot be bypassed)
- Validate shape, type, range, format, length, and business rules
- Reject early — validate before touching the database

---

## Step 1: Choose Validation Library

| Library | Best for | Style |
|---|---|---|
| **Zod** | TypeScript / modern JS | Schema-first, type inference |
| **Joi** | Node.js / Express | Fluent chainable API |
| **express-validator** | Express-specific | Middleware-based |

**Use Zod** for new projects. Examples below use Zod.

```bash
npm install zod
```

---

## Step 2: Validation Middleware Factory

```javascript
// middleware/validate.js
const { ZodError } = require('zod');
const { ValidationError } = require('../errors');

// Generic middleware — pass any Zod schema
const validate = (schema, source = 'body') => (req, res, next) => {
  try {
    const data = schema.parse(req[source]);
    req[source] = data; // Replace with parsed+coerced data
    next();
  } catch (err) {
    if (err instanceof ZodError) {
      const details = err.errors.map(e => ({
        field:   e.path.join('.'),
        message: e.message,
        code:    e.code
      }));
      throw new ValidationError(details);
    }
    next(err);
  }
};

// Validate multiple sources at once
const validateAll = (schemas) => (req, res, next) => {
  const errors = [];
  for (const [source, schema] of Object.entries(schemas)) {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      result.error.errors.forEach(e => errors.push({
        field: `${source}.${e.path.join('.')}`,
        message: e.message
      }));
    } else {
      req[source] = result.data;
    }
  }
  if (errors.length) throw new ValidationError(errors);
  next();
};

module.exports = { validate, validateAll };
```

---

## Step 3: Schema Library

**Define all schemas in one place. Never inline.**

```javascript
// validation/schemas/auth.schema.js
const { z } = require('zod');

const passwordSchema = z
  .string()
  .min(8, 'At least 8 characters')
  .max(128, 'Too long')
  .regex(/[A-Z]/, 'Must contain uppercase letter')
  .regex(/[0-9]/, 'Must contain a number')
  .regex(/[^A-Za-z0-9]/, 'Must contain special character');

const emailSchema = z
  .string()
  .email('Invalid email format')
  .toLowerCase()
  .trim();

exports.registerSchema = z.object({
  name:     z.string().trim().min(2, 'Too short').max(50, 'Too long'),
  email:    emailSchema,
  password: passwordSchema,
  role:     z.enum(['customer', 'seller']).default('customer')
});

exports.loginSchema = z.object({
  email:    emailSchema,
  password: z.string().min(1, 'Password required')
});

exports.forgotPasswordSchema = z.object({
  email: emailSchema
});

exports.resetPasswordSchema = z.object({
  token:           z.string().min(1, 'Token required'),
  password:        passwordSchema,
  confirmPassword: z.string()
}).refine(data => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword']
});
```

```javascript
// validation/schemas/product.schema.js
const { z } = require('zod');

const variantSchema = z.object({
  sku:      z.string().trim().min(1).max(50),
  color:    z.string().trim().max(30).optional(),
  size:     z.string().trim().max(20).optional(),
  price:    z.number().positive('Price must be positive').multipleOf(0.01),
  stock:    z.number().int().min(0, 'Stock cannot be negative'),
  images:   z.array(z.string().url()).max(10).default([])
});

exports.createProductSchema = z.object({
  name:        z.string().trim().min(2).max(200),
  description: z.string().trim().min(10).max(5000),
  category:    z.enum(['electronics', 'clothing', 'books', 'home', 'sports']),
  brand:       z.string().trim().max(100).optional(),
  tags:        z.array(z.string().trim().max(30)).max(10).default([]),
  variants:    z.array(variantSchema).min(1, 'At least one variant required').max(50)
});

exports.updateProductSchema = exports.createProductSchema.partial();

exports.productQuerySchema = z.object({
  page:     z.coerce.number().int().min(1).default(1),
  limit:    z.coerce.number().int().min(1).max(100).default(20),
  category: z.enum(['electronics', 'clothing', 'books', 'home', 'sports']).optional(),
  minPrice: z.coerce.number().min(0).optional(),
  maxPrice: z.coerce.number().min(0).optional(),
  sort:     z.enum(['price_asc', 'price_desc', 'rating', 'newest']).default('newest'),
  search:   z.string().trim().max(100).optional()
}).refine(data => {
  if (data.minPrice && data.maxPrice) return data.minPrice <= data.maxPrice;
  return true;
}, { message: 'minPrice must be <= maxPrice', path: ['minPrice'] });
```

```javascript
// validation/schemas/order.schema.js
const { z } = require('zod');

const addressSchema = z.object({
  street:  z.string().trim().min(5).max(200),
  city:    z.string().trim().min(2).max(100),
  state:   z.string().trim().min(2).max(100),
  zip:     z.string().trim().regex(/^\d{5}(-\d{4})?$/, 'Invalid ZIP code'),
  country: z.string().trim().length(2, 'Use 2-letter country code').toUpperCase()
});

const orderItemSchema = z.object({
  productId: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid product ID'),
  variantId: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid variant ID'),
  quantity:  z.number().int().min(1).max(100)
});

exports.createOrderSchema = z.object({
  items:           z.array(orderItemSchema).min(1).max(50),
  shippingAddress: addressSchema,
  billingAddress:  addressSchema.optional(),
  discountCode:    z.string().trim().toUpperCase().max(20).optional(),
  notes:           z.string().trim().max(500).optional()
});
```

---

## Step 4: Apply to Routes

```javascript
// routes/auth.routes.js
const { validate } = require('../middleware/validate');
const { registerSchema, loginSchema, resetPasswordSchema } = require('../validation/schemas/auth.schema');

router.post('/register',       validate(registerSchema),       authController.register);
router.post('/login',          validate(loginSchema),          authController.login);
router.post('/reset-password', validate(resetPasswordSchema),  authController.resetPassword);

// routes/product.routes.js
const { validate, validateAll } = require('../middleware/validate');
const { createProductSchema, productQuerySchema } = require('../validation/schemas/product.schema');

router.get('/',    validate(productQuerySchema, 'query'), productController.list);
router.post('/',   authenticate, requireRole('seller', 'admin'), validate(createProductSchema), productController.create);
router.put('/:id', authenticate, validate(updateProductSchema), productController.update);
```

---

## Step 5: Sanitization Rules

**Always sanitize alongside validation:**

```javascript
// utils/sanitize.js
const sanitizeHtml = require('sanitize-html'); // npm install sanitize-html

// Strip all HTML from user text fields
const sanitizeText = (str) =>
  sanitizeHtml(str, { allowedTags: [], allowedAttributes: {} });

// Allow only safe formatting tags in rich text (e.g. product descriptions)
const sanitizeRichText = (str) =>
  sanitizeHtml(str, {
    allowedTags: ['b', 'i', 'em', 'strong', 'p', 'br', 'ul', 'ol', 'li'],
    allowedAttributes: {}
  });

// Zod transform to sanitize on parse
const { z } = require('zod');
const safeStringSchema = z.string().transform(sanitizeText);
const safeRichTextSchema = z.string().transform(sanitizeRichText);
```

---

## Step 6: MongoDB ObjectId Validation

```javascript
// validation/helpers.js
const { z } = require('zod');
const mongoose = require('mongoose');

// Reusable ObjectId schema — use in any schema that takes an ID
exports.objectIdSchema = z
  .string()
  .refine(val => mongoose.Types.ObjectId.isValid(val), {
    message: 'Invalid ID format'
  });

// Usage
const getOrderSchema = z.object({
  id: exports.objectIdSchema
});

// In route
router.get('/:id', validate(getOrderSchema, 'params'), getOrder);
```

---

## Step 7: File Upload Validation

```javascript
// middleware/validateFile.js
const { FileTooLargeError, InvalidFileTypeError } = require('../errors');

const validateFile = (options = {}) => (req, res, next) => {
  const {
    maxSize    = 5 * 1024 * 1024, // 5MB default
    allowedTypes = ['image/jpeg', 'image/png', 'image/webp'],
    required   = true,
    fieldName  = 'file'
  } = options;

  const file = req.file || req.files?.[fieldName];

  if (!file) {
    if (required) throw new ValidationError([{ field: fieldName, message: 'File required' }]);
    return next();
  }

  if (file.size > maxSize) {
    throw new FileTooLargeError(`${Math.round(maxSize / 1024 / 1024)}MB`);
  }

  if (!allowedTypes.includes(file.mimetype)) {
    throw new InvalidFileTypeError(allowedTypes);
  }

  // Validate magic bytes (not just extension/mimetype)
  const magicBytes = file.buffer?.slice(0, 4).toString('hex');
  const validMagic = {
    'image/jpeg': ['ffd8ffe0', 'ffd8ffe1', 'ffd8ffdb'],
    'image/png':  ['89504e47'],
    'image/webp': ['52494646']
  };
  const allowed = validMagic[file.mimetype] || [];
  if (allowed.length && !allowed.some(m => magicBytes?.startsWith(m))) {
    throw new InvalidFileTypeError(allowedTypes);
  }

  next();
};
```

---

## Step 8: Custom Business Rule Validation

```javascript
// validation/businessRules.js — validate against database state
const { asyncHandler } = require('../middleware/errorHandler');
const { BadRequestError, NotFoundError } = require('../errors');
const Product = require('../models/Product');
const DiscountCode = require('../models/DiscountCode');

// Validate order items exist and have sufficient stock
exports.validateOrderItems = asyncHandler(async (req, res, next) => {
  const { items } = req.body;
  const errors = [];

  await Promise.all(items.map(async (item) => {
    const product = await Product.findById(item.productId);
    if (!product) {
      errors.push({ field: `items.productId`, message: `Product ${item.productId} not found` });
      return;
    }
    const variant = product.variants.id(item.variantId);
    if (!variant) {
      errors.push({ field: `items.variantId`, message: `Variant not found` });
      return;
    }
    if (variant.stock < item.quantity) {
      errors.push({
        field: `items.quantity`,
        message: `Only ${variant.stock} units of "${product.name}" available`
      });
    }
  }));

  if (errors.length) throw new ValidationError(errors);
  next();
});

// Validate discount code
exports.validateDiscountCode = asyncHandler(async (req, res, next) => {
  const { discountCode } = req.body;
  if (!discountCode) return next();

  const code = await DiscountCode.findOne({
    code: discountCode,
    isActive: true,
    expiresAt: { $gt: new Date() }
  });

  if (!code) throw new BadRequestError('Invalid or expired discount code', 'INVALID_DISCOUNT_CODE');
  if (code.usedCount >= code.maxUses) throw new BadRequestError('Discount code fully redeemed', 'DISCOUNT_EXHAUSTED');

  req.discountCode = code; // Attach for controller use
  next();
});
```

---

## Checklist

Before marking any endpoint complete:

- [ ] Every route has a Zod schema — body, query, params all validated
- [ ] Schema defined in `validation/schemas/` — never inline in route
- [ ] `select:false` password fields excluded from schema output
- [ ] User text fields sanitized against XSS
- [ ] File uploads check size, mimetype AND magic bytes
- [ ] MongoDB ObjectIds validated with `objectIdSchema`
- [ ] Range fields validated (minPrice ≤ maxPrice, quantity ≥ 1)
- [ ] Enum fields use `z.enum()` — never raw string
- [ ] Pagination limited (max 100 per page)
- [ ] Business rules validated against DB state (stock, code validity)
- [ ] Validation runs BEFORE any DB operation
- [ ] Consistent error shape: `{ field, message }` array

## Reference Files
- `references/zod-patterns.md` — Advanced Zod patterns, transforms, refinements
- `references/joi-alternative.md` — Same patterns using Joi if preferred
