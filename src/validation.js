import { z } from 'zod';

const trimmed = (min, max) => z.string().trim().min(min).max(max);
const email = () => z.string().trim().email().max(160);
const price = () => z.coerce.number().min(0).max(1e9);

export const signupSchema = z.object({
  schoolName: trimmed(2, 80),
  name: trimmed(2, 80),
  email: email(),
  password: z.string().min(8).max(200),
});

export const loginSchema = z.object({
  email: email(),
  password: z.string().min(1).max(200),
});

export const itemCreateSchema = z.object({
  name: trimmed(1, 120),
  categoryId: z.coerce.number().int().positive(),
  sku: z.string().trim().max(40).optional(),
  size: z.string().trim().max(20).optional(),
  itemClass: z.string().trim().max(40).optional(),
  subject: z.string().trim().max(60).optional(),
  description: z.string().trim().max(2000).optional(),
  costPrice: price().default(0),
  salePrice: price().default(0),
  stock: z.coerce.number().int().min(0).max(1e9).default(0),
});

export const itemUpdateSchema = z.object({
  name: trimmed(1, 120).optional(),
  size: z.string().trim().max(20).optional(),
  itemClass: z.string().trim().max(40).optional(),
  subject: z.string().trim().max(60).optional(),
  description: z.string().trim().max(2000).optional().nullable(),
  costPrice: price().optional(),
  salePrice: price().optional(),
});

export const categorySchema = z.object({
  name: trimmed(1, 80),
  description: z.string().trim().max(500).optional().nullable(),
});

export const userCreateSchema = z.object({
  email: email(),
  password: z.string().min(6).max(200),
  name: z.string().trim().max(80).optional().nullable(),
  role: z.enum(['ADMIN', 'MANAGER', 'STAFF', 'VIEWER']).optional(),
});

export const userUpdateSchema = z.object({
  name: z.string().trim().max(80).optional().nullable(),
  role: z.enum(['ADMIN', 'MANAGER', 'STAFF', 'VIEWER']).optional(),
  isActive: z.coerce.boolean().optional(),
  password: z.string().min(6).max(200).optional(),
});

export const stockMoveSchema = z.object({
  quantity: z.coerce.number().int().min(1).max(1e6),
  price: price().optional(),
  reference: z.string().trim().max(120).optional().nullable(),
});

export const settingsUpdateSchema = z.object({
  schoolName: trimmed(2, 80),
});

export const chatSchema = z.object({
  question: trimmed(3, 1000),
});

export const describeSchema = z.object({
  name: trimmed(1, 120),
  category: z.string().trim().max(80).optional(),
  size: z.string().trim().max(20).optional(),
  itemClass: z.string().trim().max(40).optional(),
  subject: z.string().trim().max(60).optional(),
});

// Middleware factory: parse req.body, 400 on failure, else replace with parsed data
export const validate = (schema) => (req, res, next) => {
  const parsed = schema.safeParse(req.body ?? {});
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = (issue?.path || []).join('.') || 'body';
    return res.status(400).json({
      success: false,
      error: `${field}: ${issue?.message || 'Invalid input'}`,
    });
  }
  req.body = parsed.data;
  next();
};
