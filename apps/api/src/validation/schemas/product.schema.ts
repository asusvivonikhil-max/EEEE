import { z } from 'zod';

const variantSchema = z.object({
  sku: z.string().trim().min(1, 'SKU is required'),
  color: z.string().trim().optional(),
  size: z.string().trim().optional(),
  price: z.coerce.number().positive('Price must be positive'),
  salePrice: z.coerce.number().positive('Sale price must be positive').optional(),
  stock: z.coerce.number().int().min(0, 'Stock cannot be negative').default(0),
  images: z.array(z.string()).default([]),
});

export const createProductSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(200),
  description: z.string().trim().min(10, 'Description must be at least 10 characters').max(5000),
  category: z.string().trim().min(1, 'Category is required'),
  brand: z.string().trim().optional(),
  tags: z.array(z.string().trim()).default([]),
  variants: z.array(variantSchema).min(1, 'At least one variant is required'),
});

export const updateProductSchema = createProductSchema.partial();

export const productQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  category: z.string().optional(),
  minPrice: z.coerce.number().min(0).optional(),
  maxPrice: z.coerce.number().min(0).optional(),
  search: z.string().trim().optional(),
});
