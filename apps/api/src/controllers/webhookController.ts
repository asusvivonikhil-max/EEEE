import { Request, Response } from 'express';
import { stripe } from '../services/stripeService';
import { config } from '../config/env';
import { Order } from '../models/Order';
import { WebhookEvent } from '../models/WebhookEvent';
import { asyncHandler } from '../middleware/errorHandler';
import { decrementOrderStock } from './orderController';

export const handleStripeWebhook = asyncHandler(async (req: Request, res: Response) => {
  const sig = req.headers['stripe-signature'];
  const endpointSecret = config.stripe.webhookSecret;

  if (!sig || !endpointSecret || !stripe) {
    console.warn('⚠️ Stripe Webhook received but signatures cannot be verified (Stripe configuration missing).');
    return res.status(400).json({ error: 'Webhook Secret configuration is missing.' });
  }

  let event: any;

  try {
    // req.body contains the raw buffer because of the raw middleware configuration
    event = stripe.webhooks.constructEvent(req.body as any, sig as string, endpointSecret);
  } catch (err: any) {
    console.error('❌ Stripe webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Idempotency check: Skip already-processed events
  const existingEvent = await WebhookEvent.findOne({ stripeEventId: event.id });
  if (existingEvent) {
    console.log(`ℹ️ Stripe webhook event ${event.id} already processed — skipping.`);
    return res.json({ received: true, status: 'duplicate' });
  }

  // Record event before processing to lock it
  const webhookEventRecord = await WebhookEvent.create({
    stripeEventId: event.id,
    type: event.type,
    status: 'processing',
    payload: event.data.object,
  });

  try {
    await processStripeEvent(event.type, event.data.object);

    // Mark as processed
    webhookEventRecord.status = 'processed';
    webhookEventRecord.processedAt = new Date();
    await webhookEventRecord.save();

    res.json({ received: true });
  } catch (err: any) {
    console.error(`❌ Webhook processing failed for event ${event.id}:`, err);
    
    webhookEventRecord.status = 'failed';
    webhookEventRecord.error = err.message;
    await webhookEventRecord.save();

    // Return 500 so Stripe retries the webhook
    res.status(500).json({ error: 'Webhook event processing failed' });
  }
});

const processStripeEvent = async (type: string, dataObject: any) => {
  switch (type) {
    case 'payment_intent.succeeded': {
      const orderId = dataObject.metadata?.orderId;
      if (!orderId) {
        console.warn('⚠️ payment_intent.succeeded missing metadata.orderId');
        return;
      }

      const order = await Order.findById(orderId);
      if (!order) {
        console.error(`❌ Order ${orderId} not found for payment_intent.succeeded`);
        return;
      }

      if (order.paymentStatus === 'paid') {
        console.log(`ℹ️ Order ${orderId} already marked as paid.`);
        return;
      }

      order.paymentStatus = 'paid';
      order.status = 'processing';
      order.statusHistory.push({
        status: 'paid',
        note: 'Payment confirmed via Stripe Webhook',
      });
      order.statusHistory.push({
        status: 'processing',
        note: 'Order processing started',
      });

      await order.save();

      // Atomically decrement variant stock
      await decrementOrderStock(order.items);
      console.log(`✅ Order ${orderId} successfully fulfilled.`);
      break;
    }

    case 'payment_intent.payment_failed': {
      const orderId = dataObject.metadata?.orderId;
      if (!orderId) return;

      const order = await Order.findById(orderId);
      if (!order) return;

      order.paymentStatus = 'failed';
      order.statusHistory.push({
        status: 'payment_failed',
        note: dataObject.last_payment_error?.message || 'Payment attempt failed',
      });

      await order.save();
      console.log(`⚠️ Order ${orderId} payment failed.`);
      break;
    }

    case 'charge.refunded': {
      const orderId = dataObject.metadata?.orderId;
      let order: any;

      if (orderId) {
        order = await Order.findById(orderId);
      } else {
        order = await Order.findOne({ paymentIntentId: dataObject.payment_intent });
      }

      if (!order) return;

      order.paymentStatus = dataObject.amount_refunded === dataObject.amount ? 'refunded' : 'partial_refund';
      order.status = dataObject.amount_refunded === dataObject.amount ? 'refunded' : order.status;
      order.statusHistory.push({
        status: 'refunded',
        note: `Refunded $${dataObject.amount_refunded / 100}`,
      });

      await order.save();
      console.log(`✅ Order ${order._id} refund recorded.`);
      break;
    }

    default:
      console.log(`ℹ️ Unhandled Stripe Webhook event: ${type}`);
  }
};
