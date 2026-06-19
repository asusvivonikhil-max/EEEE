import { Request, Response } from 'express';
import { Product } from '../models/Product';
import { Order } from '../models/Order';
import { asyncHandler } from '../middleware/errorHandler';
import { ForbiddenError } from '../errors/AppError';

export const getSellerAnalytics = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user || (req.user.role !== 'seller' && req.user.role !== 'admin')) {
    throw new ForbiddenError('Seller or Admin rights required');
  }

  const sellerId = req.user._id;

  // 1. Fetch all products of this seller
  const products = await Product.find({ sellerId }).select('_id category name variants isActive');
  const productIds = products.map(p => p._id);
  const productCategoryMap = new Map(products.map(p => [p._id.toString(), p.category]));

  // Active listings count
  const activeListings = products.filter(p => p.isActive).length;

  // 2. Fetch all orders containing this seller's products
  const orders = await Order.find({
    status: { $in: ['paid', 'processing', 'shipped', 'delivered'] },
    'items.productId': { $in: productIds }
  });

  // Calculate total revenue and total sales count for this seller's items
  let totalRevenue = 0;
  let totalSalesCount = 0;

  for (const order of orders) {
    for (const item of order.items) {
      if (productIds.some(id => id.toString() === item.productId.toString())) {
        totalRevenue += item.totalPrice;
        totalSalesCount += item.quantity;
      }
    }
  }

  // 3. Stock Alerts: Find variants with stock < 5
  const stockAlerts: any[] = [];
  for (const p of products) {
    for (const v of p.variants) {
      if (v.stock < 5) {
        stockAlerts.push({
          productId: p._id,
          productName: p.name,
          sku: v.sku,
          color: v.color,
          size: v.size,
          stock: v.stock
        });
      }
    }
  }

  // 4. Sales Trajectory: Daily sales revenue for the last 7 days
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - i);
    return d.toISOString().split('T')[0];
  }).reverse();

  const salesMap = new Map<string, number>();
  last7Days.forEach(date => salesMap.set(date, 0));

  for (const order of orders) {
    const dateStr = new Date(order.createdAt).toISOString().split('T')[0];
    if (salesMap.has(dateStr)) {
      let sellerOrderRevenue = 0;
      for (const item of order.items) {
        if (productIds.some(id => id.toString() === item.productId.toString())) {
          sellerOrderRevenue += item.totalPrice;
        }
      }
      salesMap.set(dateStr, (salesMap.get(dateStr) || 0) + sellerOrderRevenue);
    }
  }

  const salesTrajectory = last7Days.map(date => {
    const [year, month, day] = date.split('-');
    const dateObj = new Date(Number(year), Number(month) - 1, Number(day));
    const label = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return {
      date: label,
      revenue: Number(salesMap.get(date)!.toFixed(2))
    };
  });

  // 5. Category Breakdown: quantities of sold items grouped by category
  const categoryMap = new Map<string, number>();
  for (const order of orders) {
    for (const item of order.items) {
      const prodIdStr = item.productId.toString();
      if (productCategoryMap.has(prodIdStr)) {
        const cat = productCategoryMap.get(prodIdStr) || 'other';
        categoryMap.set(cat, (categoryMap.get(cat) || 0) + item.quantity);
      }
    }
  }

  const categoryBreakdown = Array.from(categoryMap.entries()).map(([name, value]) => ({
    name: name.charAt(0).toUpperCase() + name.slice(1),
    value
  }));

  res.json({
    success: true,
    data: {
      kpis: {
        totalRevenue: Number(totalRevenue.toFixed(2)),
        totalSalesCount,
        activeListings,
        totalListings: products.length
      },
      stockAlerts,
      salesTrajectory,
      categoryBreakdown
    }
  });
});
