---
name: payment-webhooks
description: >
  Use this skill whenever writing payment integration code, checkout flows, Stripe or PayPal integration, webhook endpoints, refunds, subscription billing, or any money-related backend code. Triggers include: Stripe, PayPal, payment intent, checkout session, webhook, refund, subscription, billing, invoice, or any mention of "process payment", "charge customer", "handle payment events". CRITICAL: Payment code without proper webhook handling causes double charges, lost orders, and undelivered goods. Apply this skill completely — never implement payment without webhooks.
---

# Payment Webhooks Skill

## Core Philosophy

**The checkout button is NOT the source of truth. The webhook is.**

AI always makes this mistake:
- Fulfills order immediately after payment button click
- Never sets up webhook listener
- No idempotency — same event processed twice = double order
- No signature verification = anyone can fake a payment event
- No failed payment recovery

The correct flow:
```
Client → Stripe → Webhook → Your Server → Fulfill Order
         (not: Client → Your Server → Fulfill)
```

---

## Step 1: Stripe Setup

```bash
npm install stripe
```

```javascript
// services/stripeService.js
const Stripe = require('stripe');
const config = require('../config');

const stripe = new Stripe(config.stripe.secretKey, {
  apiVersion: '2024-06-20',
  maxNetworkRetries: 3,
  timeout: 10000
});

module.exports = stripe;
```

---

## Step 2: Create Payment Intent (Server-Side)

**Never create payment intents on the client. Always server-side.**

```javascript
// controllers/paymentController.js
const stripe = require('../services/stripeService');
const Order  = require('../models/Order');
const { asyncHandler } = require('../middleware/errorHandler');
const { AppError } = require('../errors');

// POST /api/payments/create-intent
exports.createPaymentIntent = asyncHandler(async (req, res) => {
  const { orderId } = req.body;

  const order = await Order.findById(orderId);
  if (!order) throw new NotFoundError('Order');
  if (order.customerId.toString() !== req.user._id.toString()) throw new ForbiddenError();
  if (order.paymentStatus !== 'pending') {
    throw new AppError('Order already paid or in progress', 400, 'ORDER_ALREADY_PAID');
  }

  // Idempotency key — same order always creates same intent
  const idempotencyKey = `order_${orderId}_${order.updatedAt.getTime()}`;

  const paymentIntent = await stripe.paymentIntents.create({
    amount:   Math.round(order.total * 100), // Stripe uses cents
    currency: 'usd',
    customer: req.user.stripeCustomerId || undefined,
    metadata: {
      orderId:    orderId.toString(),
      customerId: req.user._id.toString(),
      orderNumber: order.orderNumber
    },
    automatic_payment_methods: { enabled: true }
  }, { idempotencyKey });

  // Store intent ID for webhook lookup
  await Order.findByIdAndUpdate(orderId, {
    paymentIntentId: paymentIntent.id,
    paymentStatus:   'authorized'
  });

  res.json({
    success: true,
    data: { clientSecret: paymentIntent.client_secret }
  });
});
```

---

## Step 3: Webhook Endpoint — The Core

**This is where orders are actually fulfilled. Must be raw body, not JSON parsed.**

```javascript
// routes/webhook.routes.js
const express = require('express');
const router  = express.Router();

// CRITICAL: Raw body required for signature verification
// Register BEFORE express.json() middleware in app.js
router.post('/stripe',
  express.raw({ type: 'application/json' }),
  webhookController.handleStripe
);

module.exports = router;
```

```javascript
// In app.js — order matters
app.use('/api/webhooks', webhookRoutes);  // Raw body — BEFORE json parser
app.use(express.json());                  // JSON for all other routes
app.use('/api', apiRoutes);
```

```javascript
// controllers/webhookController.js
const stripe  = require('../services/stripeService');
const config  = require('../config');
const Order   = require('../models/Order');
const WebhookEvent = require('../models/WebhookEvent');
const { asyncHandler } = require('../middleware/errorHandler');
const logger  = require('../utils/logger');
const emailService = require('../services/emailService');
const inventoryService = require('../services/inventoryService');

exports.handleStripe = asyncHandler(async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  // Step 1: Verify webhook signature — reject fake events
  try {
    event = stripe.webhooks.constructEvent(
      req.body,                        // Raw buffer
      sig,
      config.stripe.webhookSecret
    );
  } catch (err) {
    logger.warn('Stripe webhook signature verification failed', { error: err.message });
    return res.status(400).json({ error: `Webhook Error: ${err.message}` });
  }

  // Step 2: Idempotency — skip already-processed events
  const alreadyProcessed = await WebhookEvent.findOne({ stripeEventId: event.id });
  if (alreadyProcessed) {
    logger.info('Webhook event already processed — skipping', { eventId: event.id });
    return res.json({ received: true, status: 'duplicate' });
  }

  // Step 3: Record event immediately (before processing)
  await WebhookEvent.create({
    stripeEventId: event.id,
    type:          event.type,
    status:        'processing',
    payload:       event.data.object
  });

  // Step 4: Handle specific event types
  try {
    await handleStripeEvent(event);
    await WebhookEvent.findOneAndUpdate(
      { stripeEventId: event.id },
      { status: 'processed', processedAt: new Date() }
    );
  } catch (err) {
    await WebhookEvent.findOneAndUpdate(
      { stripeEventId: event.id },
      { status: 'failed', error: err.message }
    );
    logger.error('Webhook processing failed', { eventId: event.id, type: event.type, error: err.message });
    // Return 500 — Stripe will retry the webhook
    return res.status(500).json({ error: 'Processing failed' });
  }

  res.json({ received: true });
});

// Event handler — dispatch by type
const handleStripeEvent = async (event) => {
  const handlers = {
    'payment_intent.succeeded':       handlePaymentSucceeded,
    'payment_intent.payment_failed':  handlePaymentFailed,
    'payment_intent.canceled':        handlePaymentCanceled,
    'charge.dispute.created':         handleDisputeCreated,
    'charge.refunded':                handleRefundProcessed,
  };

  const handler = handlers[event.type];
  if (handler) {
    await handler(event.data.object);
  } else {
    logger.info('Unhandled webhook event type', { type: event.type });
  }
};
```

---

## Step 4: Event Handlers

```javascript
// handlers/paymentHandlers.js
const Order  = require('../models/Order');
const logger = require('../utils/logger');
const emailService = require('../services/emailService');
const inventoryService = require('../services/inventoryService');

const handlePaymentSucceeded = async (paymentIntent) => {
  const { orderId } = paymentIntent.metadata;
  const order = await Order.findById(orderId).populate('items.productId');

  if (!order) {
    logger.error('Order not found for payment intent', { orderId, paymentIntentId: paymentIntent.id });
    return;
  }

  // Skip if already fulfilled (idempotency)
  if (order.paymentStatus === 'paid') {
    logger.info('Order already fulfilled', { orderId });
    return;
  }

  // Update order status
  order.paymentStatus = 'paid';
  order.status = 'processing';
  order.statusHistory.push({
    status: 'processing',
    note: 'Payment confirmed via Stripe webhook'
  });
  await order.save();

  // Decrement inventory
  await inventoryService.decrementStock(order.items);

  // Send confirmation email
  await emailService.sendOrderConfirmation(order);

  logger.info('Order fulfilled after payment', { orderId, amount: paymentIntent.amount });
};

const handlePaymentFailed = async (paymentIntent) => {
  const { orderId } = paymentIntent.metadata;

  const order = await Order.findByIdAndUpdate(orderId, {
    paymentStatus: 'failed',
    status: 'pending', // Allow retry
    $push: {
      statusHistory: {
        status: 'payment_failed',
        note: paymentIntent.last_payment_error?.message || 'Payment failed'
      }
    }
  }, { new: true });

  if (order) {
    await emailService.sendPaymentFailed(order, paymentIntent.last_payment_error?.message);
  }

  logger.warn('Payment failed', { orderId, error: paymentIntent.last_payment_error?.message });
};

const handlePaymentCanceled = async (paymentIntent) => {
  const { orderId } = paymentIntent.metadata;

  await Order.findByIdAndUpdate(orderId, {
    status: 'cancelled',
    paymentStatus: 'failed',
    $push: { statusHistory: { status: 'cancelled', note: 'Payment intent canceled' } }
  });
};

const handleDisputeCreated = async (charge) => {
  // Flag order for manual review
  await Order.findOneAndUpdate(
    { paymentIntentId: charge.payment_intent },
    {
      $push: {
        statusHistory: {
          status: 'disputed',
          note: `Dispute created: ${charge.dispute?.reason || 'unknown reason'}`
        }
      }
    }
  );
  // Alert admin
  logger.warn('Payment dispute created', {
    chargeId: charge.id,
    amount: charge.amount,
    reason: charge.dispute?.reason
  });
};

const handleRefundProcessed = async (charge) => {
  await Order.findOneAndUpdate(
    { paymentIntentId: charge.payment_intent },
    {
      paymentStatus: charge.amount_refunded === charge.amount ? 'refunded' : 'partial_refund',
      $push: {
        statusHistory: {
          status: 'refunded',
          note: `Refunded $${charge.amount_refunded / 100}`
        }
      }
    }
  );
};

module.exports = {
  handlePaymentSucceeded, handlePaymentFailed,
  handlePaymentCanceled, handleDisputeCreated, handleRefundProcessed
};
```

---

## Step 5: WebhookEvent Model (Idempotency Store)

```javascript
// models/WebhookEvent.js
const mongoose = require('mongoose');

const webhookEventSchema = new mongoose.Schema({
  stripeEventId: { type: String, required: true, unique: true, index: true },
  type:          { type: String, required: true },
  status:        { type: String, enum: ['processing', 'processed', 'failed'], default: 'processing' },
  payload:       mongoose.Schema.Types.Mixed,
  error:         String,
  processedAt:   Date
}, { timestamps: true });

// Auto-delete after 90 days
webhookEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

module.exports = mongoose.model('WebhookEvent', webhookEventSchema);
```

---

## Step 6: Refund Flow

```javascript
// controllers/paymentController.js
// POST /api/orders/:id/refund — Admin only
exports.refundOrder = asyncHandler(async (req, res) => {
  const { amount, reason } = req.body;
  const order = await Order.findById(req.params.id);

  if (!order) throw new NotFoundError('Order');
  if (order.paymentStatus !== 'paid') {
    throw new AppError('Order is not in a refundable state', 400, 'NOT_REFUNDABLE');
  }

  const refundAmount = amount
    ? Math.round(amount * 100)      // Partial refund
    : Math.round(order.total * 100); // Full refund

  const refund = await stripe.refunds.create({
    payment_intent: order.paymentIntentId,
    amount:         refundAmount,
    reason:         reason || 'requested_by_customer',
    metadata:       { orderId: order._id.toString(), processedBy: req.user._id.toString() }
  });

  // Webhook (charge.refunded) will update the order status
  // Don't update here — let webhook handle it (single source of truth)

  res.json({ success: true, data: { refundId: refund.id, amount: refund.amount / 100 } });
});
```

---

## Step 7: Local Webhook Testing

```bash
# Install Stripe CLI
brew install stripe/stripe-cli/stripe

# Login
stripe login

# Forward webhooks to local server
stripe listen --forward-to localhost:5000/api/webhooks/stripe

# Trigger test events
stripe trigger payment_intent.succeeded
stripe trigger payment_intent.payment_failed
stripe trigger charge.refunded
```

---

## Checklist

- [ ] Webhook endpoint uses `express.raw()` — NOT `express.json()`
- [ ] Webhook route registered BEFORE `express.json()` middleware
- [ ] Stripe signature verified with `stripe.webhooks.constructEvent()`
- [ ] WebhookEvent model stores all events for idempotency
- [ ] Duplicate event check before processing
- [ ] Order fulfilled in webhook handler — NOT in checkout response
- [ ] Payment intent metadata includes orderId for webhook lookup
- [ ] Failed webhook returns 500 so Stripe retries
- [ ] All Stripe error types handled (card, rate limit, connection)
- [ ] Refund goes through Stripe — webhook updates order status
- [ ] Dispute handler flags order for admin review
- [ ] Local testing done with Stripe CLI before deploy
- [ ] Webhook secret in `.env` — never hardcoded

## Reference Files
- `references/paypal-webhooks.md` — PayPal equivalent webhook patterns
- `references/stripe-test-cards.md` — Test card numbers for all scenarios
