import { Request, Response } from 'express';
import { supabaseAdmin } from '../utils/supabaseClient';
import { successResponse, errorResponse } from '../utils/responseHandlers';
import { z } from 'zod';

// Validation schema for coupon creation/update
const couponSchema = z.object({
  code: z.string().min(3, 'Code must be at least 3 characters').transform(val => val.toUpperCase().trim()),
  description: z.string().optional(),
  discount_type: z.enum(['percentage', 'fixed_amount', 'free_shipping']),
  discount_value: z.number().min(0),
  min_purchase_amount: z.number().min(0).optional().default(0),
  max_discount_amount: z.number().min(0).optional().nullable(),
  start_date: z.string().datetime().optional(),
  end_date: z.string().datetime().optional().nullable(),
  usage_limit: z.number().int().positive().optional().nullable(),
  per_user_limit: z.number().int().positive().optional().nullable(),
  is_active: z.boolean().optional().default(true),
  applicable_products: z.array(z.string().uuid()).optional().nullable(),
  applicable_categories: z.array(z.string()).optional().nullable(),
});

export class CouponController {
  // List all coupons
  async listCoupons(req: Request, res: Response) {
    try {
      const { page = 1, limit = 10, search, status } = req.query;
      const offset = (Number(page) - 1) * Number(limit);

      let query = supabaseAdmin
        .from('coupons')
        .select('*', { count: 'exact' });

      if (search) {
        query = query.ilike('code', `%${search}%`);
      }

      if (status === 'active') {
        query = query.eq('is_active', true);
      } else if (status === 'inactive') {
        query = query.eq('is_active', false);
      }

      const { data, error, count } = await query
        .range(offset, offset + Number(limit) - 1)
        .order('created_at', { ascending: false });

      if (error) throw error;

      return successResponse(res, {
        coupons: data,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total: count,
          totalPages: Math.ceil((count || 0) / Number(limit)),
        }
      }, 'Coupons retrieved successfully');
    } catch (error: any) {
      console.error('Error listing coupons:', error);
      return errorResponse(res, error.message || 'Failed to list coupons', 500);
    }
  }

  // Get coupon by ID
  async getCoupon(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { data, error } = await supabaseAdmin
        .from('coupons')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;
      if (!data) return errorResponse(res, 'Coupon not found', 404);

      return successResponse(res, data, 'Coupon details retrieved');
    } catch (error: any) {
      return errorResponse(res, error.message || 'Failed to get coupon', 500);
    }
  }

  // Create new coupon
  async createCoupon(req: Request, res: Response) {
    try {
      // Validate input
      const validationResult = couponSchema.safeParse(req.body);
      
      if (!validationResult.success) {
        return errorResponse(res, 'Validation failed', 400, validationResult.error.format());
      }

      const couponData = validationResult.data;

      // Check if code exists
      const { data: existing } = await supabaseAdmin
        .from('coupons')
        .select('id')
        .eq('code', couponData.code)
        .maybeSingle();

      if (existing) {
        return errorResponse(res, `Coupon code "${couponData.code}" already exists`, 409);
      }

      const { data, error } = await supabaseAdmin
        .from('coupons')
        .insert([couponData])
        .select()
        .single();

      if (error) throw error;

      return successResponse(res, data, 'Coupon created successfully', 201);
    } catch (error: any) {
      console.error('Error creating coupon:', error);
      return errorResponse(res, error.message || 'Failed to create coupon', 500);
    }
  }

  // Update coupon
  async updateCoupon(req: Request, res: Response) {
    try {
      const { id } = req.params;
      
      // Validate input (partial allowed)
      const partialSchema = couponSchema.partial();
      const validationResult = partialSchema.safeParse(req.body);

      if (!validationResult.success) {
        return errorResponse(res, 'Validation failed', 400, validationResult.error.format());
      }

      const updates = validationResult.data;

      // Don't allow updating code to an existing one
      if (updates.code) {
        const { data: existing } = await supabaseAdmin
          .from('coupons')
          .select('id')
          .eq('code', updates.code)
          .neq('id', id)
          .maybeSingle();

        if (existing) {
          return errorResponse(res, `Coupon code "${updates.code}" already exists`, 409);
        }
      }

      const { data, error } = await supabaseAdmin
        .from('coupons')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      return successResponse(res, data, 'Coupon updated successfully');
    } catch (error: any) {
      console.error('Error updating coupon:', error);
      return errorResponse(res, error.message || 'Failed to update coupon', 500);
    }
  }

  // Delete coupon
  async deleteCoupon(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { error } = await supabaseAdmin
        .from('coupons')
        .delete()
        .eq('id', id);

      if (error) throw error;

      return successResponse(res, null, 'Coupon deleted successfully');
    } catch (error: any) {
      return errorResponse(res, error.message || 'Failed to delete coupon', 500);
    }
  }
}

export default new CouponController();

