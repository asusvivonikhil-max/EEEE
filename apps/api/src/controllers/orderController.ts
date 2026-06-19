import { Request, Response } from 'express';
import { Order } from '../models/Order';
import { Product } from '../models/Product';
import { Coupon } from '../models/Coupon';
import { stripe } from '../services/stripeService';
import { asyncHandler } from '../middleware/errorHandler';
import { NotFoundError, ValidationError, ForbiddenError } from '../errors/AppError';
import { redis } from '../services/redisService';

// helper to decrement stock atomically
export const decrementOrderStock = async (items: any[]) => {
  for (const item of items) {
    if (!item.allocations || item.allocations.length === 0) {
      throw new ValidationError([{ field: 'stock', message: `No warehouse allocations found for SKU ${item.variantSku}` }]);
    }

    for (const allocation of item.allocations) {
      const { warehouse, quantity } = allocation;

      const result = await Product.updateOne(
        {
          _id: item.productId,
          variants: {
            $elemMatch: {
              sku: item.variantSku,
              warehouseStocks: {
                $elemMatch: {
                  warehouse,
                  stock: { $gte: quantity }
                }
              }
            }
          }
        },
        {
          $inc: {
            'variants.$[v].warehouseStocks.$[w].stock': -quantity,
            'variants.$[v].stock': -quantity
          }
        },
        {
          arrayFilters: [
            { 'v.sku': item.variantSku },
            { 'w.warehouse': warehouse }
          ]
        }
      );

      if (result.matchedCount === 0) {
        throw new ValidationError([{
          field: 'stock',
          message: `Insufficient stock in warehouse ${warehouse} for SKU ${item.variantSku} or race condition occurred.`
        }]);
      }
    }
  }
};

export const createCheckoutOrder = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new ForbiddenError('Authentication required');
  }

  const { shippingAddress, couponCode } = req.body;

  if (!shippingAddress || !shippingAddress.street || !shippingAddress.city || !shippingAddress.zip || !shippingAddress.country || !shippingAddress.phone) {
    throw new ValidationError([{ field: 'shippingAddress', message: 'Complete shipping address is required' }]);
  }

  // Find user's cart in Redis
  const cartData = await redis.get(`cart:${req.user._id}`);
  const cartItems = cartData ? JSON.parse(cartData) : [];

  if (cartItems.length === 0) {
    throw new ValidationError([{ field: 'cart', message: 'Your shopping cart is empty' }]);
  }

  const orderItems: any[] = [];
  let subtotal = 0;

  for (const item of cartItems) {
    const product = await Product.findOne({ _id: item.productId, isActive: true });
    if (!product) {
      throw new ValidationError([{ field: 'cart', message: 'One or more items in your cart are no longer available' }]);
    }

    const variant = product.variants.find((v: any) => v.sku === item.variantSku);
    if (!variant) {
      throw new ValidationError([{ field: 'cart', message: `Product variant SKU ${item.variantSku} is no longer available` }]);
    }

    if (variant.stock < item.quantity) {
      throw new ValidationError([{ field: 'quantity', message: `Only ${variant.stock} units of ${product.name} are available in stock` }]);
    }

    let whStocks = variant.warehouseStocks;
    if (!whStocks || whStocks.length === 0) {
      const baseStock = variant.stock || 0;
      const nycStock = Math.floor(baseStock / 2);
      const laStock = baseStock - nycStock;
      whStocks = [
        { warehouse: 'NYC', stock: nycStock },
        { warehouse: 'LA', stock: laStock }
      ];
    }

    const allocations: { warehouse: string; quantity: number }[] = [];
    let remainingQty = item.quantity;

    for (const whStock of whStocks) {
      if (remainingQty <= 0) break;
      if (whStock.stock > 0) {
        const allocatedQty = Math.min(whStock.stock, remainingQty);
        allocations.push({
          warehouse: whStock.warehouse,
          quantity: allocatedQty,
        });
        remainingQty -= allocatedQty;
      }
    }

    if (remainingQty > 0) {
      throw new ValidationError([{
        field: 'quantity',
        message: `Insufficient stock for product ${product.name} across warehouses.`,
      }]);
    }

    const price = variant.salePrice !== undefined && variant.salePrice !== null ? variant.salePrice : variant.price;
    const itemTotalPrice = price * item.quantity;
    subtotal += itemTotalPrice;

    orderItems.push({
      productId: product._id,
      variantSku: item.variantSku,
      snapshot: {
        name: product.name,
        sku: item.variantSku,
        image: variant.images?.[0] || product.variants[0]?.images?.[0],
        price,
      },
      quantity: item.quantity,
      unitPrice: price,
      totalPrice: itemTotalPrice,
      allocations,
    });
  }

  // Handle coupon validation & discount calculation
  let discountAmount = 0;
  let appliedCoupon = null;

  if (couponCode) {
    const normalizedCode = couponCode.toUpperCase().trim();
    const coupon = await Coupon.findOne({ code: normalizedCode });
    if (!coupon) {
      throw new ValidationError([{ field: 'couponCode', message: `Coupon code '${normalizedCode}' not found` }]);
    }
    if (!coupon.isActive) {
      throw new ValidationError([{ field: 'couponCode', message: 'This coupon code is inactive' }]);
    }
    if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date()) {
      throw new ValidationError([{ field: 'couponCode', message: 'This coupon code has expired' }]);
    }
    if (coupon.usageLimit && coupon.usageCount >= coupon.usageLimit) {
      throw new ValidationError([{ field: 'couponCode', message: 'This coupon code has reached its usage limit' }]);
    }
    if (subtotal < coupon.minOrderAmount) {
      throw new ValidationError([{ field: 'couponCode', message: `Minimum order subtotal of $${coupon.minOrderAmount} is required for this coupon` }]);
    }

    // Calculate discount
    if (coupon.discountType === 'percentage') {
      discountAmount = Number((subtotal * (coupon.discountValue / 100)).toFixed(2));
    } else if (coupon.discountType === 'fixed') {
      discountAmount = coupon.discountValue;
    }

    if (discountAmount > subtotal) {
      discountAmount = subtotal;
    }
    appliedCoupon = coupon;
  }

  const discountedSubtotal = subtotal - discountAmount;

  // Calculate Shipping (free shipping above $150, else $15)
  const shipping = discountedSubtotal >= 150 ? 0 : 15;
  // Calculate Tax (8% tax rate)
  const tax = Number((discountedSubtotal * 0.08).toFixed(2));
  const total = Number((discountedSubtotal + shipping + tax).toFixed(2));

  const paymentMethod = stripe ? 'stripe' : 'simulated';

  const order = new Order({
    customerId: req.user._id,
    items: orderItems,
    shippingAddress,
    subtotal,
    discountAmount,
    couponCode: appliedCoupon ? appliedCoupon.code : undefined,
    shipping,
    tax,
    total,
    paymentMethod,
    status: 'pending',
    paymentStatus: 'pending',
    statusHistory: [{ status: 'pending', note: 'Order checkout initialized' }],
  });

  if (stripe && paymentMethod === 'stripe') {
    try {
      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(total * 100),
        currency: 'usd',
        metadata: {
          orderId: order._id.toString(),
          customerId: req.user._id.toString(),
          orderNumber: order.orderNumber,
        },
      });

      order.paymentIntentId = paymentIntent.id;
      await order.save();

      // Increment coupon usage count on successful order save
      if (appliedCoupon) {
        appliedCoupon.usageCount += 1;
        await appliedCoupon.save();
      }

      // Clear Cart in Redis
      await redis.del(`cart:${req.user._id}`);

      res.status(201).json({
        success: true,
        data: {
          orderId: order._id,
          orderNumber: order.orderNumber,
          clientSecret: paymentIntent.client_secret,
          paymentMethod: 'stripe',
          total,
        },
      });
    } catch (err: any) {
      console.error('❌ Failed to create Stripe Payment Intent:', err);
      // Fallback to simulated order
      order.paymentMethod = 'simulated';
      await order.save();

      if (appliedCoupon) {
        appliedCoupon.usageCount += 1;
        await appliedCoupon.save();
      }

      await redis.del(`cart:${req.user._id}`);

      res.status(201).json({
        success: true,
        data: {
          orderId: order._id,
          orderNumber: order.orderNumber,
          clientSecret: 'simulated_secret',
          paymentMethod: 'simulated',
          total,
          warning: 'Stripe failed, fell back to Simulated Gateway',
        },
      });
    }
  } else {
    // Simulated path
    await order.save();

    if (appliedCoupon) {
      appliedCoupon.usageCount += 1;
      await appliedCoupon.save();
    }

    // Clear Cart in Redis
    await redis.del(`cart:${req.user._id}`);

    res.status(201).json({
      success: true,
      data: {
        orderId: order._id,
        orderNumber: order.orderNumber,
        clientSecret: 'simulated_secret',
        paymentMethod: 'simulated',
        total,
      },
    });
  }
});

export const simulatePaymentSuccess = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new ForbiddenError('Authentication required');
  }

  const { id } = req.params;

  const order = await Order.findById(id);
  if (!order) {
    throw new NotFoundError('Order');
  }

  // Ensure requester owns the order or is admin
  if (req.user.role !== 'admin' && order.customerId.toString() !== req.user._id.toString()) {
    throw new ForbiddenError('You do not have access to this order');
  }

  if (order.status !== 'pending' || (order.paymentMethod !== 'simulated' && process.env.NODE_ENV === 'production')) {
    throw new ValidationError([{ field: 'order', message: 'Order is not eligible for simulated payment confirmation' }]);
  }

  // Update order status
  order.paymentStatus = 'paid';
  order.status = 'processing';
  order.statusHistory.push({
    status: 'paid',
    note: 'Payment confirmed via simulated gateway',
  });
  order.statusHistory.push({
    status: 'processing',
    note: 'Order processing started',
  });

  await order.save();

  // Atomically decrement stock
  await decrementOrderStock(order.items);

  res.json({
    success: true,
    message: 'Simulated payment succeeded, order is now processing.',
    data: order,
  });
});

export const getOrderDetails = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new ForbiddenError('Authentication required');
  }

  const { id } = req.params;

  const order = await Order.findById(id).populate('customerId', 'name email');
  if (!order) {
    throw new NotFoundError('Order');
  }

  // Ensure requester is owner or admin
  if (req.user.role !== 'admin' && order.customerId._id.toString() !== req.user._id.toString()) {
    throw new ForbiddenError('Access Denied');
  }

  res.json({
    success: true,
    data: order,
  });
});

export const listMyOrders = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new ForbiddenError('Authentication required');
  }

  // Admin sees all orders, customers see only their own
  const filter = req.user.role === 'admin' ? {} : { customerId: req.user._id };

  const orders = await Order.find(filter).sort({ createdAt: -1 });

  res.json({
    success: true,
    data: orders,
  });
});

export const updateOrderStatus = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user || (req.user.role !== 'seller' && req.user.role !== 'admin')) {
    throw new ForbiddenError('Sellers or Admin rights required');
  }

  const { id } = req.params;
  const { status, trackingNumber, note } = req.body;

  const order = await Order.findById(id);
  if (!order) {
    throw new NotFoundError('Order');
  }

  const current = order.status;
  const next = status;
  let isValidTransition = false;

  // Strict Sequential Order State Machine Transitions
  if (current === 'pending' && next === 'cancelled') {
    order.paymentStatus = 'failed';
    isValidTransition = true;
  } else if (current === 'paid' && next === 'processing') {
    isValidTransition = true;
  } else if (current === 'processing' && next === 'shipped') {
    if (!trackingNumber) {
      throw new ValidationError([{ field: 'trackingNumber', message: 'Tracking number is required when shipping an order' }]);
    }
    order.trackingNumber = trackingNumber;
    isValidTransition = true;
  } else if (current === 'shipped' && next === 'delivered') {
    isValidTransition = true;
  } else if (['paid', 'processing', 'shipped', 'delivered'].includes(current) && next === 'refunded') {
    order.paymentStatus = 'refunded';
    isValidTransition = true;
  }

  if (!isValidTransition) {
    throw new ValidationError([{ field: 'status', message: `Invalid status transition from '${current}' to '${next}'` }]);
  }

  order.status = next;
  order.statusHistory.push({
    status: next,
    note: note || `Order status updated to ${next}`,
  });

  await order.save();

  res.json({
    success: true,
    message: `Order status updated to ${next}`,
    data: order,
  });
});
