import { Request, Response } from 'express';
import { Order } from '../models/Order';
import { asyncHandler } from '../middleware/errorHandler';
import { NotFoundError, ValidationError, ForbiddenError } from '../errors/AppError';

export const getFulfillmentQueue = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user || !['warehouse', 'seller', 'admin'].includes(req.user.role)) {
    throw new ForbiddenError('Access Denied: Warehouse staff, seller or admin rights required');
  }

  const orders = await Order.find({ status: 'processing' })
    .sort({ createdAt: 1 })
    .populate('customerId', 'name email');
    
  res.json({
    success: true,
    data: orders,
  });
});

export const getConsolidatedPickList = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user || !['warehouse', 'seller', 'admin'].includes(req.user.role)) {
    throw new ForbiddenError('Access Denied: Warehouse staff, seller or admin rights required');
  }

  const orders = await Order.find({ status: 'processing' });
  const pickMap: { [key: string]: { sku: string; name: string; warehouse: string; quantity: number } } = {};

  for (const order of orders) {
    for (const item of order.items) {
      if (item.allocations && item.allocations.length > 0) {
        for (const alloc of item.allocations) {
          const key = `${alloc.warehouse}_${item.variantSku}`;
          if (pickMap[key]) {
            pickMap[key].quantity += alloc.quantity;
          } else {
            pickMap[key] = {
              sku: item.variantSku,
              name: item.snapshot.name,
              warehouse: alloc.warehouse,
              quantity: alloc.quantity,
            };
          }
        }
      }
    }
  }

  res.json({
    success: true,
    data: Object.values(pickMap),
  });
});

export const packAndShipOrder = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user || !['warehouse', 'seller', 'admin'].includes(req.user.role)) {
    throw new ForbiddenError('Access Denied: Warehouse staff, seller or admin rights required');
  }

  const { id } = req.params;
  const { trackingNumber } = req.body;

  if (!trackingNumber) {
    throw new ValidationError([{ field: 'trackingNumber', message: 'Tracking number is required when shipping an order' }]);
  }

  const order = await Order.findById(id);
  if (!order) {
    throw new NotFoundError('Order');
  }

  if (order.status !== 'processing') {
    throw new ValidationError([{ field: 'status', message: `Order status is '${order.status}', but must be 'processing' to pack & ship.` }]);
  }

  order.status = 'shipped';
  order.trackingNumber = trackingNumber;
  order.statusHistory.push({
    status: 'shipped',
    note: `Order packed and shipped with tracking number: ${trackingNumber}`,
  });

  await order.save();

  res.json({
    success: true,
    message: 'Order successfully marked as shipped',
    data: order,
  });
});
