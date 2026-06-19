# Fine-Grained Permissions — ABAC (Attribute-Based Access Control)

Use when roles alone aren't enough. Example: seller can only edit THEIR OWN products.

## Permission Matrix

```javascript
// config/permissions.js

const permissions = {
  // Products
  'product:create':      ['admin', 'seller'],
  'product:read':        ['admin', 'seller', 'customer', 'guest'],
  'product:update':      ['admin', 'seller'],     // + ownership check
  'product:delete':      ['admin', 'seller'],     // + ownership check
  'product:feature':     ['admin'],               // Only admin can feature products

  // Orders
  'order:create':        ['customer', 'admin'],
  'order:read':          ['admin', 'seller', 'customer'], // + ownership check
  'order:update-status': ['admin', 'seller'],
  'order:refund':        ['admin'],
  'order:cancel':        ['admin', 'customer'],   // + ownership check

  // Users
  'user:read-any':       ['admin'],
  'user:read-own':       ['admin', 'seller', 'customer'],
  'user:update-role':    ['admin'],
  'user:deactivate':     ['admin'],

  // Analytics
  'analytics:global':    ['admin'],
  'analytics:own-store': ['admin', 'seller'],     // + ownership check
};

const can = (role, action) => {
  const allowed = permissions[action];
  if (!allowed) return false;
  return allowed.includes(role);
};

module.exports = { permissions, can };
```

## Permission Middleware

```javascript
// middleware/authorize.js
const { can } = require('../config/permissions');
const { ForbiddenError } = require('../errors');

const requirePermission = (action) => (req, res, next) => {
  if (!can(req.user?.role, action)) {
    throw new ForbiddenError(`Missing permission: ${action}`);
  }
  next();
};

// Usage in routes
router.post('/products',
  authenticate,
  requirePermission('product:create'),
  createProduct
);

router.delete('/products/:id',
  authenticate,
  requirePermission('product:delete'),
  requireOwnership(async (req) => {
    const product = await Product.findById(req.params.id).select('sellerId');
    return product?.sellerId;
  }),
  deleteProduct
);
```

## Dynamic permission check in controllers

```javascript
// When you need to check permissions in business logic
const { can } = require('../config/permissions');

exports.getOrderDetails = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order) throw new NotFoundError('Order');

  // Admin sees everything
  if (req.user.role === 'admin') {
    return res.json({ success: true, data: order });
  }

  // Customer sees own order only
  if (req.user.role === 'customer') {
    if (order.customerId.toString() !== req.user._id.toString()) {
      throw new ForbiddenError();
    }
    return res.json({ success: true, data: order.toCustomerView() });
  }

  // Seller sees orders containing their products
  if (req.user.role === 'seller') {
    const hasSellerProduct = order.items.some(
      item => item.sellerId.toString() === req.user._id.toString()
    );
    if (!hasSellerProduct) throw new ForbiddenError();
    return res.json({ success: true, data: order.toSellerView() });
  }
});
```
