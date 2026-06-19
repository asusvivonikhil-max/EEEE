---
name: seed-edge-cases
description: >
  Use this skill whenever creating database seed files, test fixtures, sample data, or factory functions. Triggers include: "seed the database", "create test data", "sample data", "fixtures", "factories", "fake data", "populate the database", "npm run seed", or any request to generate initial data for development or testing. Apply this skill completely — seeds without edge cases make tests useless because they only cover happy paths.
---

# Seed + Edge Cases Skill

## Core Philosophy

**Seeds that only cover happy paths are worse than no seeds — they give false confidence.**

Every seed must include:
- Normal/happy path records (the majority)
- Edge case records (the important minority)
- Boundary values (min/max/zero quantities)
- Error state records (expired, failed, locked)
- Cross-relationship records (data linking all models together)

---

## Step 1: Seed Runner Architecture

```javascript
// scripts/seed/index.js — master runner
require('dotenv').config();
const mongoose = require('mongoose');
const config   = require('../../config');
const logger   = require('../../utils/logger');

// Import all seeders in dependency order
const seedUsers     = require('./seeders/users');
const seedProducts  = require('./seeders/products');
const seedOrders    = require('./seeders/orders');
const seedReviews   = require('./seeders/reviews');
const seedDiscounts = require('./seeders/discounts');

const run = async (reset = false) => {
  await mongoose.connect(config.db.mongoUri);
  logger.info('Connected to database');

  if (reset) {
    logger.info('Resetting database...');
    await mongoose.connection.dropDatabase();
    logger.info('Database cleared');
  }

  try {
    // Order matters — respect foreign key dependencies
    const users     = await seedUsers();
    const products  = await seedProducts(users);
    const orders    = await seedOrders(users, products);
    const discounts = await seedDiscounts();
    await seedReviews(users, products, orders);

    logger.info('✅ Seeding complete', {
      users:     users.length,
      products:  products.length,
      orders:    orders.length,
      discounts: discounts.length
    });
  } catch (err) {
    logger.error('Seeding failed', { error: err.message, stack: err.stack });
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
};

// CLI: npm run seed OR npm run seed:reset
const isReset = process.argv.includes('--reset');
run(isReset);
```

```json
// package.json scripts
{
  "scripts": {
    "seed":       "node scripts/seed/index.js",
    "seed:reset": "node scripts/seed/index.js --reset",
    "seed:test":  "NODE_ENV=test node scripts/seed/index.js --reset"
  }
}
```

---

## Step 2: User Seeds — All Roles + Edge Cases

```javascript
// scripts/seed/seeders/users.js
const { faker } = require('@faker-js/faker'); // npm install @faker-js/faker
const bcrypt = require('bcryptjs');
const User   = require('../../../models/User');

const FIXED_PASSWORD_HASH = bcrypt.hashSync('Password123!', 12);

module.exports = async () => {
  const users = [
    // ── Fixed accounts for development login ────────────────
    {
      name: 'Admin User',
      email: 'admin@store.com',
      password: FIXED_PASSWORD_HASH,
      role: 'admin',
      isActive: true,
      isEmailVerified: true
    },
    {
      name: 'Seller Alice',
      email: 'seller@store.com',
      password: FIXED_PASSWORD_HASH,
      role: 'seller',
      isActive: true,
      isEmailVerified: true
    },
    {
      name: 'Customer Bob',
      email: 'customer@store.com',
      password: FIXED_PASSWORD_HASH,
      role: 'customer',
      isActive: true,
      isEmailVerified: true
    },

    // ── Edge cases ────────────────────────────────────────────
    {
      name: 'Locked Account',
      email: 'locked@store.com',
      password: FIXED_PASSWORD_HASH,
      role: 'customer',
      isActive: true,
      loginAttempts: 5,
      lockUntil: new Date(Date.now() + 30 * 60 * 1000), // Locked for 30 min
      isEmailVerified: true
    },
    {
      name: 'Unverified User',
      email: 'unverified@store.com',
      password: FIXED_PASSWORD_HASH,
      role: 'customer',
      isActive: true,
      isEmailVerified: false   // Email not verified
    },
    {
      name: 'Deactivated User',
      email: 'deactivated@store.com',
      password: FIXED_PASSWORD_HASH,
      role: 'customer',
      isActive: false,         // Deactivated account
      isEmailVerified: true
    },

    // ── 10 random customers ───────────────────────────────────
    ...Array.from({ length: 10 }, () => ({
      name:     faker.person.fullName(),
      email:    faker.internet.email().toLowerCase(),
      password: FIXED_PASSWORD_HASH,
      role:     'customer',
      isActive: true,
      isEmailVerified: true,
      profile: {
        phone:  faker.phone.number(),
        avatar: faker.image.avatar()
      }
    })),

    // ── 3 additional sellers ─────────────────────────────────
    ...Array.from({ length: 3 }, () => ({
      name:     faker.company.name(),
      email:    faker.internet.email().toLowerCase(),
      password: FIXED_PASSWORD_HASH,
      role:     'seller',
      isActive: true,
      isEmailVerified: true
    }))
  ];

  const created = await User.insertMany(users);
  console.log(`  👤 Seeded ${created.length} users`);
  return created;
};
```

---

## Step 3: Product Seeds — Happy + Edge Cases

```javascript
// scripts/seed/seeders/products.js
const { faker } = require('@faker-js/faker');
const Product   = require('../../../models/Product');

const CATEGORIES = ['electronics', 'clothing', 'books', 'home', 'sports'];

module.exports = async (users) => {
  const sellers = users.filter(u => u.role === 'seller');

  const products = [
    // ── Edge case: Out of stock ──────────────────────────────
    {
      name: 'Out of Stock Item',
      slug: 'out-of-stock-item',
      description: faker.commerce.productDescription(),
      category: 'electronics',
      sellerId: sellers[0]._id,
      variants: [{ sku: 'OOS-001', price: 29.99, stock: 0 }], // Zero stock
      isActive: true,
      stats: { averageRating: 0, reviewCount: 0 }
    },
    // ── Edge case: Inactive/unlisted product ─────────────────
    {
      name: 'Unlisted Product',
      slug: 'unlisted-product',
      description: faker.commerce.productDescription(),
      category: 'clothing',
      sellerId: sellers[0]._id,
      variants: [{ sku: 'UNL-001', price: 15.00, stock: 50 }],
      isActive: false  // Should not appear in public listings
    },
    // ── Edge case: Very low stock (triggers alert) ───────────
    {
      name: 'Almost Gone Item',
      slug: 'almost-gone-item',
      description: faker.commerce.productDescription(),
      category: 'home',
      sellerId: sellers[1]._id,
      variants: [{ sku: 'LOW-001', price: 45.00, stock: 2 }], // Low stock
      isActive: true
    },
    // ── Edge case: Max price item ────────────────────────────
    {
      name: 'Premium Luxury Item',
      slug: 'premium-luxury-item',
      description: faker.commerce.productDescription(),
      category: 'electronics',
      sellerId: sellers[0]._id,
      variants: [{ sku: 'LUX-001', price: 9999.99, stock: 5 }],
      isActive: true,
      isFeatured: true
    },
    // ── Edge case: Multiple variants ────────────────────────
    {
      name: 'Multi-Variant T-Shirt',
      slug: 'multi-variant-t-shirt',
      description: faker.commerce.productDescription(),
      category: 'clothing',
      sellerId: sellers[1]._id,
      variants: [
        { sku: 'TS-SM-BLK', color: 'Black', size: 'S', price: 19.99, stock: 10 },
        { sku: 'TS-MD-BLK', color: 'Black', size: 'M', price: 19.99, stock: 25 },
        { sku: 'TS-LG-BLK', color: 'Black', size: 'L', price: 19.99, stock: 15 },
        { sku: 'TS-SM-WHT', color: 'White', size: 'S', price: 19.99, stock: 0 }, // One variant OOS
        { sku: 'TS-MD-WHT', color: 'White', size: 'M', price: 19.99, stock: 8 }
      ],
      isActive: true
    },

    // ── 45 regular products across categories ────────────────
    ...Array.from({ length: 45 }, (_, i) => {
      const seller = sellers[i % sellers.length];
      const category = CATEGORIES[i % CATEGORIES.length];
      return {
        name:        faker.commerce.productName(),
        slug:        `product-${i + 1}-${faker.string.alphanumeric(6).toLowerCase()}`,
        description: faker.commerce.productDescription(),
        category,
        brand:       faker.company.name(),
        tags:        [category, faker.commerce.department().toLowerCase()],
        sellerId:    seller._id,
        variants:    [{
          sku:   `SKU-${String(i + 1).padStart(4, '0')}`,
          price: Number(faker.commerce.price({ min: 5, max: 500 })),
          stock: faker.number.int({ min: 5, max: 200 })
        }],
        isActive: true,
        stats: {
          averageRating: Number(faker.number.float({ min: 3, max: 5, fractionDigits: 1 })),
          reviewCount:   faker.number.int({ min: 0, max: 150 })
        }
      };
    })
  ];

  const created = await Product.insertMany(products);
  console.log(`  📦 Seeded ${created.length} products`);
  return created;
};
```

---

## Step 4: Order Seeds — All Lifecycle States

```javascript
// scripts/seed/seeders/orders.js
const Order   = require('../../../models/Order');

module.exports = async (users, products) => {
  const customers = users.filter(u => u.role === 'customer');
  const activeProducts = products.filter(p => p.isActive && p.variants[0].stock > 0);

  const makeItem = (product) => ({
    productId:  product._id,
    variantId:  product.variants[0]._id,
    sellerId:   product.sellerId,
    snapshot:   { name: product.name, sku: product.variants[0].sku, price: product.variants[0].price },
    quantity:   1,
    unitPrice:  product.variants[0].price,
    totalPrice: product.variants[0].price
  });

  const address = {
    name: 'John Doe', street: '123 Main St', city: 'New York',
    state: 'NY', zip: '10001', country: 'US'
  };

  // One order per lifecycle status
  const statusOrders = ['pending','paid','processing','shipped','delivered','cancelled','refunded']
    .map((status, i) => {
      const product = activeProducts[i % activeProducts.length];
      const total   = product.variants[0].price;
      return {
        customerId:      customers[0]._id,
        items:           [makeItem(product)],
        shippingAddress: address,
        subtotal: total, shipping: 5.99, tax: total * 0.08, total: total + 5.99 + total * 0.08,
        status,
        paymentStatus:   ['pending','failed'].includes(status) ? 'pending' : status === 'refunded' ? 'refunded' : 'paid',
        paymentMethod:   'stripe',
        paymentIntentId: `pi_test_seed_${status}_${i}`,
        statusHistory:   [{ status, note: `Seeded for testing ${status} state` }]
      };
    });

  // Edge case: order with failed payment
  const failedPaymentOrder = {
    customerId: customers[1]._id,
    items: [makeItem(activeProducts[0])],
    shippingAddress: address,
    subtotal: 50, shipping: 5.99, tax: 4, total: 59.99,
    status: 'pending',
    paymentStatus: 'failed',
    paymentMethod: 'stripe',
    paymentIntentId: 'pi_test_failed_payment',
    statusHistory: [{ status: 'payment_failed', note: 'Card declined — insufficient funds' }]
  };

  // Edge case: order with partial refund
  const partialRefundOrder = {
    customerId: customers[2]._id,
    items: [makeItem(activeProducts[1]), makeItem(activeProducts[2])],
    shippingAddress: address,
    subtotal: 100, shipping: 0, tax: 8, total: 108,
    status: 'delivered',
    paymentStatus: 'partial_refund',
    paymentMethod: 'stripe',
    paymentIntentId: 'pi_test_partial_refund',
    statusHistory: [
      { status: 'paid',      note: 'Payment received' },
      { status: 'delivered', note: 'Delivered' },
      { status: 'partial_refund', note: 'Item 1 returned — $50 refunded' }
    ]
  };

  const allOrders = [...statusOrders, failedPaymentOrder, partialRefundOrder];
  const created   = await Order.insertMany(allOrders);
  console.log(`  🛒 Seeded ${created.length} orders`);
  return created;
};
```

---

## Step 5: Discount Code Seeds

```javascript
// scripts/seed/seeders/discounts.js
const DiscountCode = require('../../../models/DiscountCode');

module.exports = async () => {
  const codes = [
    { code: 'SAVE10',    type: 'percentage', value: 10,  maxUses: 100, usedCount: 0,  isActive: true,  expiresAt: new Date('2099-12-31') },
    { code: 'FREESHIP',  type: 'shipping',   value: 100, maxUses: 500, usedCount: 0,  isActive: true,  minOrderValue: 50, expiresAt: new Date('2099-12-31') },
    { code: 'FLAT20',    type: 'fixed',      value: 20,  maxUses: 50,  usedCount: 0,  isActive: true,  expiresAt: new Date('2099-12-31') },
    // Edge cases
    { code: 'EXPIRED01', type: 'percentage', value: 15,  maxUses: 100, usedCount: 0,  isActive: true,  expiresAt: new Date('2020-01-01') }, // Expired date
    { code: 'MAXEDOUT',  type: 'percentage', value: 5,   maxUses: 10,  usedCount: 10, isActive: true,  expiresAt: new Date('2099-12-31') }, // Fully used
    { code: 'INACTIVE',  type: 'fixed',      value: 10,  maxUses: 100, usedCount: 0,  isActive: false, expiresAt: new Date('2099-12-31') }, // Deactivated
  ];

  const created = await DiscountCode.insertMany(codes);
  console.log(`  🏷️  Seeded ${created.length} discount codes`);
  return created;
};
```

---

## Step 6: Factory Pattern for Tests

```javascript
// tests/factories/index.js — reusable in unit/integration tests
const { faker } = require('@faker-js/faker');
const User    = require('../../models/User');
const Product = require('../../models/Product');
const Order   = require('../../models/Order');

const userFactory = {
  build: (overrides = {}) => ({
    name:            faker.person.fullName(),
    email:           faker.internet.email().toLowerCase(),
    password:        'Password123!',
    role:            'customer',
    isActive:        true,
    isEmailVerified: true,
    ...overrides
  }),
  create: async (overrides = {}) => User.create(userFactory.build(overrides)),
  createMany: async (count, overrides = {}) =>
    Promise.all(Array.from({ length: count }, () => userFactory.create(overrides)))
};

const productFactory = {
  build: (sellerId, overrides = {}) => ({
    name:        faker.commerce.productName(),
    slug:        `test-${faker.string.alphanumeric(8).toLowerCase()}`,
    description: faker.commerce.productDescription(),
    category:    'electronics',
    sellerId,
    variants:    [{ sku: faker.string.alphanumeric(8), price: 29.99, stock: 100 }],
    isActive:    true,
    ...overrides
  }),
  create: async (sellerId, overrides = {}) => Product.create(productFactory.build(sellerId, overrides))
};

module.exports = { userFactory, productFactory };

// Usage in tests:
// const user = await userFactory.create({ role: 'admin' });
// const product = await productFactory.create(user._id, { 'variants.0.stock': 0 });
```

---

## Checklist

- [ ] Seed runner supports `--reset` flag (drop + re-seed)
- [ ] Seeds run in dependency order (users before products before orders)
- [ ] Fixed accounts for each role (admin, seller, customer) with known credentials
- [ ] Edge cases covered per model (see below)
- [ ] Faker.js used for realistic data — not "test1", "test2"
- [ ] Seeds are idempotent OR use `--reset` to handle re-runs

### Edge Cases Per Model
- **Users**: locked account, unverified email, deactivated account, each role
- **Products**: zero stock, inactive, low stock, multiple variants, one OOS variant
- **Orders**: all lifecycle statuses, failed payment, partial refund, multi-item
- **Discounts**: expired date, max uses reached, inactive flag
- **Reviews**: pending moderation, flagged, verified purchase, non-verified

## Reference Files
- `references/faker-cookbook.md` — Faker.js patterns for common data types
