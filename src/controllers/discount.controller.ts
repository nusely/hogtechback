import { Request, Response } from 'express';
import {
  DiscountEvaluationInput,
  evaluateDiscount,
} from '../services/discount.service';
import { successResponse, errorResponse } from '../utils/responseHandlers';
import { supabaseAdmin } from '../utils/supabaseClient';

export class DiscountController {
  async applyDiscount(req: Request, res: Response) {
    try {
      // Log incoming request for debugging
      console.log('📥 Discount apply request received:', {
        body: req.body,
        bodyKeys: Object.keys(req.body || {}),
        hasItems: Array.isArray(req.body?.items),
        itemsLength: Array.isArray(req.body?.items) ? req.body.items.length : 'not an array',
        itemsType: typeof req.body?.items,
      });

      const payload = req.body as DiscountEvaluationInput;

      // Normalize code
      const normalizedCode = payload.code?.trim().toUpperCase() || '';
      if (!normalizedCode) {
        return errorResponse(res, 'Discount code is required', 400);
      }

      const result = await evaluateDiscount({
        code: normalizedCode,
        subtotal: payload.subtotal,
        deliveryFee: payload.deliveryFee,
        items: payload.items,
      });

      return successResponse(res, result, 'Discount applied successfully');
    } catch (error: any) {
      const message = error?.message || 'Failed to apply discount';
      console.error('Discount apply error:', {
        error: message,
        code: req.body?.code,
        stack: error?.stack,
      });
      return errorResponse(res, message, 400);
    }
  }

  // Removed: testApplyDiscount, testCouponLookup - coupon system removed

  // List available discounts (coupons removed)
  async listDiscounts(req: Request, res: Response) {
    try {
      const discountsResult = await supabaseAdmin
        .from('discounts')
        .select('id, name, type, value, is_active, valid_from, valid_until, usage_limit, used_count, minimum_amount')
        .order('created_at', { ascending: false })
        .limit(50);

      if (discountsResult.error) {
        console.error('Error fetching discounts:', discountsResult.error);
      }

      return successResponse(res, {
        discounts: discountsResult.data || [],
      }, 'Discounts retrieved successfully');
    } catch (error: any) {
      return errorResponse(res, error?.message || 'Failed to retrieve discounts', 500);
    }
  }
}

export default new DiscountController();

