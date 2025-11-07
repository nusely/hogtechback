import { z } from 'zod';

export const signUpSchema = z.object({
  email: z.string().email('A valid email is required'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  firstName: z.string().max(100).optional().nullable(),
  lastName: z.string().max(100).optional().nullable(),
  phone: z.string().max(30).optional().nullable(),
  captchaToken: z.string().optional(),
});

export const emailOnlySchema = z.object({
  email: z.string().email('A valid email is required'),
  captchaToken: z.string().optional(),
});

export const contactFormSchema = z.object({
  name: z.string().min(1).max(150),
  email: z.string().email('A valid email is required'),
  phone: z.string().max(50).optional().nullable(),
  subject: z.string().min(1).max(200),
  message: z.string().min(1).max(2000),
  captchaToken: z.string().optional(),
});

export const investmentFormSchema = z.object({
  fullName: z.string().min(1).max(150),
  email: z.string().email('A valid email is required'),
  phone: z.string().min(5).max(30),
  tier: z.string().min(1).max(50),
  amount: z.union([z.number(), z.string()]).refine((val) => {
    const num = typeof val === 'string' ? parseFloat(val) : val;
    return !Number.isNaN(num) && num > 0;
  }, 'Investment amount must be a positive number'),
  plan: z.string().min(1).max(100),
  message: z.string().max(2000).optional().nullable(),
  captchaToken: z.string().optional(),
});

export const trackOrderSchema = z.object({
  order_number: z.string().min(1).max(100),
  email: z.string().email('A valid email is required'),
});

export const paymentVerifySchema = z.object({
  reference: z.string().min(1),
});

export const presignUploadSchema = z.object({
  filename: z.string().min(1).max(255),
  contentType: z
    .string()
    .min(1)
    .regex(/^[\w.+-]+\/[\w.+-]+$/, 'contentType must be a valid MIME type'),
  folder: z.string().min(1).max(100).optional(),
});

const orderItemSchema = z.object({
  product_id: z.string().uuid().optional().nullable(),
  product_name: z.string().min(1),
  product_image: z.string().optional().nullable(),
  quantity: z.number().int().positive(),
  unit_price: z.number().nonnegative(),
  subtotal: z.number().nonnegative(),
  selected_variants: z.record(z.string(), z.any()).optional(),
  standalone_source_id: z.string().optional().nullable(),
});

const customerAddressSchema = z.object({
  full_name: z.string().min(1),
  email: z.string().email().optional().nullable(),
  phone: z.string().min(5),
  street_address: z.string().min(1),
  city: z.string().min(1),
  region: z.string().min(1),
  postal_code: z.string().optional().nullable(),
});

const deliveryOptionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  price: z.number().min(0),
  type: z.enum(['delivery', 'pickup']),
  estimated_days: z.number().int().positive().optional().nullable(),
});

export const orderCreateSchema = z.object({
  user_id: z.string().uuid().optional().nullable(),
  subtotal: z.number().min(0),
  discount: z.number().min(0).optional().default(0),
  discount_code: z.string().min(1).optional().nullable(),
  tax: z.number().min(0).optional().default(0),
  delivery_fee: z.number().min(0).optional().default(0),
  total: z.number().min(0),
  payment_method: z.enum(['mobile_money', 'card', 'cash_on_delivery', 'paystack']),
  delivery_address: customerAddressSchema,
  delivery_option: deliveryOptionSchema.optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
  payment_reference: z.string().optional().nullable(),
  order_items: z.array(orderItemSchema).min(1),
});

export const applyDiscountSchema = z.object({
  code: z.string().min(1),
  subtotal: z.number().min(0),
  deliveryFee: z.number().min(0),
  items: z
    .array(
      z.object({
        product_id: z.string().uuid().optional().nullable(),
        product_name: z.string().min(1),
        quantity: z.number().int().positive(),
        unit_price: z.number().min(0),
        subtotal: z.number().min(0),
      })
    )
    .min(1),
});


