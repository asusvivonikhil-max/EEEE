import { Request, Response } from 'express';
import { Coupon } from '../models/Coupon';
import { asyncHandler } from '../middleware/errorHandler';
import { ValidationError, NotFoundError, ForbiddenError } from '../errors/AppError';

export const createCoupon = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user || (req.user.role !== 'seller' && req.user.role !== 'admin')) {
    throw new ForbiddenError('Sellers or Admin rights required');
  }

  const { code, discountType, discountValue, minOrderAmount, expiresAt, usageLimit, isActive } = req.body;

  if (!code || !discountType || discountValue === undefined) {
    throw new ValidationError([
      { field: 'code/discountType/discountValue', message: 'Required fields are missing' }
    ]);
  }

  const normalizedCode = code.toUpperCase().trim();

  // Check if coupon code already exists
  const existing = await Coupon.findOne({ code: normalizedCode });
  if (existing) {
    throw new ValidationError([{ field: 'code', message: `Coupon code '${normalizedCode}' already exists` }]);
  }

  const coupon = new Coupon({
    code: normalizedCode,
    discountType,
    discountValue,
    minOrderAmount: minOrderAmount || 0,
    expiresAt: expiresAt ? new Date(expiresAt) : undefined,
    usageLimit: usageLimit || undefined,
    isActive: isActive !== undefined ? isActive : true,
    sellerId: req.user.role === 'seller' ? req.user._id : undefined,
  });

  await coupon.save();

  res.status(201).json({
    success: true,
    message: `Coupon code '${normalizedCode}' created successfully`,
    data: coupon,
  });
});

export const listCoupons = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user || (req.user.role !== 'seller' && req.user.role !== 'admin')) {
    throw new ForbiddenError('Sellers or Admin rights required');
  }

  // Sellers see their own coupons; Admins see all coupons
  const filter = req.user.role === 'admin' ? {} : { sellerId: req.user._id };

  const coupons = await Coupon.find(filter).sort({ createdAt: -1 });

  res.json({
    success: true,
    data: coupons,
  });
});

export const applyCouponCode = asyncHandler(async (req: Request, res: Response) => {
  const { code, subtotal } = req.body;

  if (!code || subtotal === undefined) {
    throw new ValidationError([{ field: 'code/subtotal', message: 'Coupon code and subtotal are required' }]);
  }

  const normalizedCode = code.toUpperCase().trim();
  const coupon = await Coupon.findOne({ code: normalizedCode });

  if (!coupon) {
    throw new NotFoundError(`Coupon code '${normalizedCode}'`);
  }

  if (!coupon.isActive) {
    throw new ValidationError([{ field: 'coupon', message: 'This coupon code is inactive' }]);
  }

  if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date()) {
    throw new ValidationError([{ field: 'coupon', message: 'This coupon code has expired' }]);
  }

  if (coupon.usageLimit && coupon.usageCount >= coupon.usageLimit) {
    throw new ValidationError([{ field: 'coupon', message: 'This coupon code has reached its maximum usage limit' }]);
  }

  if (subtotal < coupon.minOrderAmount) {
    throw new ValidationError([{
      field: 'coupon',
      message: `Minimum order subtotal of $${coupon.minOrderAmount} is required for this coupon`
    }]);
  }

  // Calculate discount amount
  let discountAmount = 0;
  if (coupon.discountType === 'percentage') {
    discountAmount = Number((subtotal * (coupon.discountValue / 100)).toFixed(2));
  } else if (coupon.discountType === 'fixed') {
    discountAmount = coupon.discountValue;
  }

  // Cap discount to subtotal
  if (discountAmount > subtotal) {
    discountAmount = subtotal;
  }

  res.json({
    success: true,
    data: {
      couponCode: coupon.code,
      discountType: coupon.discountType,
      discountValue: coupon.discountValue,
      discountAmount,
      finalSubtotal: subtotal - discountAmount
    }
  });
});
