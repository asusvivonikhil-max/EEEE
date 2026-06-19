import { z } from 'zod';

const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password cannot exceed 128 characters');

const emailSchema = z
  .string()
  .email('Invalid email format')
  .toLowerCase()
  .trim();

export const registerSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(50, 'Name cannot exceed 50 characters'),
  email: emailSchema,
  password: passwordSchema,
  role: z.enum(['customer', 'seller', 'admin', 'warehouse']).default('customer'),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
});
