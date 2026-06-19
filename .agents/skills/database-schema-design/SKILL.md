---
name: database-schema-design
description: >
  Use this skill whenever designing or writing database schemas, models, collections, tables, or relationships for any application. Triggers include: Mongoose models, MongoDB collections, SQL tables, schema definitions, entity relationships, indexes, migrations, or any mention of "how to store", "data model", "database design", "schema", or "model". Also trigger when the user describes what their app does and needs a data layer. Apply this skill BEFORE writing any schema code — wrong schema design is the hardest problem to fix after data exists in production.
---

# Database Schema Design Skill

## Core Philosophy

**Design for queries, not just storage. A schema that can't be queried efficiently at scale is broken by design.**

AI schema mistakes that are painful to fix later:
- No indexes on fields used in queries
- Embedding when you should reference (or vice versa)
- Missing timestamps, soft deletes, audit fields
- Storing computed values that go stale
- Schemas that assume single-currency, single-language, single-timezone

---

## Step 1: Embed vs Reference Decision

```
Embed when:                          Reference when:
✅ Data is always loaded together    ✅ Data is loaded independently
✅ Array is bounded (< ~50 items)   ✅ Array is unbounded (comments, orders)
✅ Data doesn't change often        ✅ Data is shared across documents
✅ Strong ownership (1:1, 1:few)    ✅ Many-to-many relationships
                                    ✅ Data needs to be queried directly
```

---

## Step 2: Core Schema Patterns

### User Schema
```javascript
// models/User.js
const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name:     { type: String, required: true, trim: true, maxlength: 100 },
  email:    { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true, select: false, minlength: 8 },
  role:     { type: String, enum: ['customer', 'seller', 'admin'], default: 'customer', index: true },

  profile: {
    avatar:  String,
    phone:   String,
    bio:     { type: String, maxlength: 500 }
  },

  addresses: [{
    _id:      { type: mongoose.Schema.Types.ObjectId, auto: true },
    label:    { type: String, enum: ['home', 'work', 'other'], default: 'home' },
    street:   { type: String, required: true },
    city:     { type: String, required: true },
    state:    String,
    zip:      String,
    country:  { type: String, required: true, length: 2 },
    isDefault: { type: Boolean, default: false }
  }],

  // Auth
  isActive:        { type: Boolean, default: true, index: true },
  isEmailVerified: { type: Boolean, default: false },
  googleId:        { type: String, sparse: true }, // sparse: null values don't get indexed

  // Security
  loginAttempts:     { type: Number, default: 0, select: false },
  lockUntil:         { type: Date, select: false },
  passwordChangedAt: { type: Date, select: false },
  refreshTokens:     { type: Array, select: false },

}, { timestamps: true }); // Adds createdAt, updatedAt automatically

// Indexes
userSchema.index({ email: 1 });                    // Fast login lookup
userSchema.index({ role: 1, isActive: 1 });        // Admin user list
userSchema.index({ googleId: 1 }, { sparse: true }); // OAuth lookup

// Virtual: full name from name parts if needed
userSchema.virtual('initials').get(function() {
  return this.name.split(' ').map(n => n[0]).join('').toUpperCase();
});
```

### Product Schema
```javascript
// models/Product.js
const variantSchema = new mongoose.Schema({
  sku:       { type: String, required: true },
  color:     String,
  size:      String,
  price:     { type: Number, required: true, min: 0 },
  salePrice: { type: Number, min: 0 },
  stock:     { type: Number, required: true, min: 0, default: 0 },
  reserved:  { type: Number, default: 0 }, // Items in carts
  images:    [String],
  weight:    Number, // grams
  barcode:   String
}, { _id: true });

const productSchema = new mongoose.Schema({
  name:        { type: String, required: true, trim: true, maxlength: 200 },
  slug:        { type: String, required: true, unique: true, lowercase: true },
  description: { type: String, required: true, maxlength: 5000 },
  category:    { type: String, required: true, index: true },
  subcategory: String,
  brand:       { type: String, index: true },
  tags:        [{ type: String, lowercase: true }],

  sellerId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

  variants:    [variantSchema],

  // Denormalized aggregates (updated by background job — fast reads)
  stats: {
    averageRating: { type: Number, default: 0, min: 0, max: 5 },
    reviewCount:   { type: Number, default: 0 },
    salesCount:    { type: Number, default: 0 },
    viewCount:     { type: Number, default: 0 },
  },

  isActive:   { type: Boolean, default: true, index: true },
  isFeatured: { type: Boolean, default: false, index: true },

  seo: {
    metaTitle:       String,
    metaDescription: String,
    keywords:        [String]
  }
}, { timestamps: true });

// Compound indexes — match your most common queries
productSchema.index({ category: 1, isActive: 1 });
productSchema.index({ sellerId: 1, isActive: 1 });
productSchema.index({ tags: 1 });
productSchema.index({ 'stats.averageRating': -1 });
productSchema.index({ createdAt: -1 });
productSchema.index({ name: 'text', description: 'text', tags: 'text' }); // Full-text search

// Slug auto-generation
productSchema.pre('save', function(next) {
  if (this.isModified('name') && !this.slug) {
    this.slug = this.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }
  next();
});
```

### Order Schema
```javascript
// models/Order.js
const orderItemSchema = new mongoose.Schema({
  productId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  variantId:   mongoose.Schema.Types.ObjectId,
  sellerId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

  // Snapshot at time of order — never reference live product (price could change)
  snapshot: {
    name:      String,
    sku:       String,
    image:     String,
    price:     Number,  // Price at time of purchase
  },

  quantity:     { type: Number, required: true, min: 1 },
  unitPrice:    { type: Number, required: true },
  totalPrice:   { type: Number, required: true },
  status:       { type: String, enum: ['pending', 'processing', 'shipped', 'delivered', 'returned'], default: 'pending' },
  trackingNumber: String
}, { _id: true });

const orderSchema = new mongoose.Schema({
  orderNumber:  { type: String, unique: true }, // Human-readable: ORD-2024-00001
  customerId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  items:        [orderItemSchema],

  // Address snapshot — customer may change address later
  shippingAddress: {
    name:    String,
    street:  String,
    city:    String,
    state:   String,
    zip:     String,
    country: String,
    phone:   String
  },

  // Financials
  subtotal:     { type: Number, required: true },
  discount:     { type: Number, default: 0 },
  shipping:     { type: Number, default: 0 },
  tax:          { type: Number, default: 0 },
  total:        { type: Number, required: true },

  discountCode: String,

  // Payment
  paymentStatus: {
    type: String,
    enum: ['pending', 'authorized', 'paid', 'failed', 'refunded', 'partial_refund'],
    default: 'pending',
    index: true
  },
  paymentMethod: { type: String, enum: ['stripe', 'paypal', 'wallet'] },
  paymentIntentId: String, // Stripe/PayPal reference

  // Order lifecycle
  status: {
    type: String,
    enum: ['pending', 'paid', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'],
    default: 'pending',
    index: true
  },

  // Audit trail — full history of status changes
  statusHistory: [{
    status:    String,
    timestamp: { type: Date, default: Date.now },
    note:      String,
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  }],

  notes: String,

  // Soft delete
  deletedAt: { type: Date, default: null }

}, { timestamps: true });

// Indexes
orderSchema.index({ customerId: 1, createdAt: -1 });   // Customer order history
orderSchema.index({ status: 1, createdAt: -1 });       // Admin order management
orderSchema.index({ paymentIntentId: 1 });             // Webhook lookup
orderSchema.index({ orderNumber: 1 });
orderSchema.index({ 'items.sellerId': 1, status: 1 }); // Seller orders

// Auto-generate order number
orderSchema.pre('save', async function(next) {
  if (this.isNew && !this.orderNumber) {
    const count = await mongoose.model('Order').countDocuments();
    this.orderNumber = `ORD-${new Date().getFullYear()}-${String(count + 1).padStart(5, '0')}`;
  }
  next();
});
```

### Review Schema (Separate collection — unbounded)
```javascript
// models/Review.js
const reviewSchema = new mongoose.Schema({
  productId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  orderId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Order' }, // Verified purchase

  rating:     { type: Number, required: true, min: 1, max: 5 },
  title:      { type: String, trim: true, maxlength: 100 },
  body:       { type: String, trim: true, maxlength: 2000 },
  images:     [String],

  isVerifiedPurchase: { type: Boolean, default: false },
  helpfulVotes:       { type: Number, default: 0 },

  // Moderation
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', index: true },
  flaggedCount: { type: Number, default: 0 }

}, { timestamps: true });

// One review per product per customer
reviewSchema.index({ productId: 1, customerId: 1 }, { unique: true });
reviewSchema.index({ productId: 1, status: 1, rating: -1 });

// After save: update product's denormalized stats
reviewSchema.post('save', async function() {
  const stats = await mongoose.model('Review').aggregate([
    { $match: { productId: this.productId, status: 'approved' } },
    { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } }
  ]);
  if (stats[0]) {
    await mongoose.model('Product').findByIdAndUpdate(this.productId, {
      'stats.averageRating': Math.round(stats[0].avg * 10) / 10,
      'stats.reviewCount':   stats[0].count
    });
  }
});
```

---

## Step 3: Soft Delete Pattern

```javascript
// Never hard-delete in production — you'll need the data
// Add to any schema that needs it:

schema.add({ deletedAt: { type: Date, default: null } });
schema.index({ deletedAt: 1 });

// Middleware to exclude deleted docs from all queries
schema.pre(/^find/, function() {
  if (!this.getOptions().includeDeleted) {
    this.where({ deletedAt: null });
  }
});

// Instance method
schema.methods.softDelete = function() {
  this.deletedAt = new Date();
  return this.save();
};

// Usage
await product.softDelete();
// To include deleted: Product.find({ ... }).setOptions({ includeDeleted: true })
```

---

## Step 4: Index Strategy

```javascript
// Rules for when to add indexes:
// ✅ Fields used in .find() / .where() queries
// ✅ Fields used in .sort()
// ✅ Fields used in aggregation $match stage
// ✅ Foreign key references (ref fields)
// ✅ Unique constraints

// Types of indexes:
schema.index({ field: 1 });                    // Single field ascending
schema.index({ field: -1 });                   // Single field descending
schema.index({ fieldA: 1, fieldB: -1 });       // Compound (order matters — matches query order)
schema.index({ field: 1 }, { unique: true });  // Unique constraint
schema.index({ field: 1 }, { sparse: true });  // Skip null values (for optional unique fields)
schema.index({ name: 'text', desc: 'text' });  // Full-text search
schema.index({ location: '2dsphere' });        // Geospatial

// ⚠️ Don't over-index: each index slows writes and uses disk
// Rule: Add index when query takes > 100ms. Explain queries: Model.find({}).explain('executionStats')
```

---

## Step 5: Migrations

For schema changes on existing data → read `references/migrations.md`

---

## Checklist

- [ ] Every `ref` field has an `index: true`
- [ ] Compound indexes match the fields used together in queries
- [ ] Timestamps added to every schema (`{ timestamps: true }`)
- [ ] Soft delete pattern on schemas with important data
- [ ] `select: false` on password, tokens, sensitive fields
- [ ] Price snapshots in orders — never reference live prices
- [ ] Unbounded arrays (reviews, orders, messages) are separate collections
- [ ] Bounded arrays (addresses, variants, 2–50 items) can embed
- [ ] Text indexes added for searchable fields
- [ ] Unique indexes with `sparse: true` for optional unique fields
- [ ] Post-save hooks update denormalized aggregates (rating, count)

## Reference Files
- `references/migrations.md` — Schema migration patterns for existing data
- `references/aggregations.md` — Common aggregation pipelines (stats, reports)
- `references/sql-schemas.md` — PostgreSQL equivalent patterns with Prisma
