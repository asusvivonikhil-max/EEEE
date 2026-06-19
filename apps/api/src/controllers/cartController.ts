import { Request, Response } from 'express';
import { Product } from '../models/Product';
import { asyncHandler } from '../middleware/errorHandler';
import { NotFoundError, ValidationError, ForbiddenError } from '../errors/AppError';
import { redis } from '../services/redisService';

// Helper to populate and format the cart from Redis
export const getPopulatedCart = async (userId: any) => {
  const data = await redis.get(`cart:${userId}`);
  const items = data ? JSON.parse(data) : [];

  const formattedItems: any[] = [];
  for (const item of items) {
    const product = await Product.findOne({ _id: item.productId, isActive: true });
    if (!product) continue;

    const variant = product.variants.find((v: any) => v.sku === item.variantSku);
    if (!variant) continue;

    const price = variant.salePrice !== undefined && variant.salePrice !== null ? variant.salePrice : variant.price;
    const subtotal = price * item.quantity;

    formattedItems.push({
      productId: product._id.toString(),
      name: product.name,
      slug: product.slug,
      description: product.description,
      brand: product.brand,
      category: product.category,
      variantSku: item.variantSku,
      price: variant.price,
      salePrice: variant.salePrice,
      stock: variant.stock,
      images: variant.images && variant.images.length > 0 ? variant.images : (product.variants[0]?.images || []),
      quantity: item.quantity,
      subtotal,
    });
  }

  const totalItems = formattedItems.reduce((acc, item) => acc + item.quantity, 0);
  const subtotal = Number(formattedItems.reduce((acc, item) => acc + item.subtotal, 0).toFixed(2));

  return {
    userId: userId.toString(),
    items: formattedItems,
    totalItems,
    subtotal,
  };
};

export const getCart = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new ForbiddenError('Authentication required');
  }

  const cartData = await getPopulatedCart(req.user._id);

  res.json({
    success: true,
    data: cartData,
  });
});

export const addToCart = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new ForbiddenError('Authentication required');
  }

  const { productId, variantSku, quantity } = req.body;

  // Verify product exists and is active
  const product = await Product.findOne({ _id: productId, isActive: true });
  if (!product) {
    throw new NotFoundError('Product');
  }

  // Verify variant exists
  const variant = product.variants.find((v) => v.sku === variantSku);
  if (!variant) {
    throw new NotFoundError('Product Variant');
  }

  // Check initial stock limit
  if (variant.stock < quantity) {
    throw new ValidationError([{ field: 'quantity', message: `Only ${variant.stock} units available in stock` }]);
  }

  // Fetch cart from Redis
  const data = await redis.get(`cart:${req.user._id}`);
  const items = data ? JSON.parse(data) : [];

  // Find if SKU is already in the cart
  const existingItemIndex = items.findIndex((item: any) => item.variantSku === variantSku);

  if (existingItemIndex > -1) {
    const newQuantity = items[existingItemIndex].quantity + quantity;
    // Validate combined stock limit
    if (variant.stock < newQuantity) {
      throw new ValidationError([{ field: 'quantity', message: `Only ${variant.stock} units available. You already have ${items[existingItemIndex].quantity} in your cart.` }]);
    }
    items[existingItemIndex].quantity = newQuantity;
  } else {
    items.push({
      productId: product._id.toString(),
      variantSku,
      quantity,
    });
  }

  await redis.set(`cart:${req.user._id}`, JSON.stringify(items));

  const cartData = await getPopulatedCart(req.user._id);

  res.json({
    success: true,
    data: cartData,
  });
});

export const updateCartItem = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new ForbiddenError('Authentication required');
  }

  const { sku } = req.params;
  const { quantity } = req.body;

  const data = await redis.get(`cart:${req.user._id}`);
  const items = data ? JSON.parse(data) : [];

  const itemIndex = items.findIndex((item: any) => item.variantSku === sku);
  if (itemIndex === -1) {
    throw new NotFoundError('Cart Item');
  }

  if (quantity === 0) {
    // Remove item
    items.splice(itemIndex, 1);
  } else {
    // Check product and variant stock
    const productId = items[itemIndex].productId;
    const product = await Product.findOne({ _id: productId, isActive: true });
    if (!product) {
      throw new NotFoundError('Product');
    }

    const variant = product.variants.find((v) => v.sku === sku);
    if (!variant) {
      throw new NotFoundError('Product Variant');
    }

    if (variant.stock < quantity) {
      throw new ValidationError([{ field: 'quantity', message: `Only ${variant.stock} units available in stock` }]);
    }

    items[itemIndex].quantity = quantity;
  }

  await redis.set(`cart:${req.user._id}`, JSON.stringify(items));

  const cartData = await getPopulatedCart(req.user._id);

  res.json({
    success: true,
    data: cartData,
  });
});

export const removeCartItem = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new ForbiddenError('Authentication required');
  }

  const { sku } = req.params;

  const data = await redis.get(`cart:${req.user._id}`);
  let items = data ? JSON.parse(data) : [];

  items = items.filter((item: any) => item.variantSku !== sku);
  await redis.set(`cart:${req.user._id}`, JSON.stringify(items));

  const cartData = await getPopulatedCart(req.user._id);

  res.json({
    success: true,
    data: cartData,
  });
});

export const clearCart = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new ForbiddenError('Authentication required');
  }

  await redis.del(`cart:${req.user._id}`);

  const cartData = await getPopulatedCart(req.user._id);

  res.json({
    success: true,
    data: cartData,
  });
});
