import { Request, Response } from 'express';
import {
  DiscountEvaluationInput,
  evaluateDiscount,
} from '../services/discount.service';
import { successResponse, errorResponse } from '../utils/responseHandlers';

export class DiscountController {
  async applyDiscount(req: Request, res: Response) {
    try {
      const payload = req.body as DiscountEvaluationInput;

      const result = await evaluateDiscount({
        code: payload.code,
        subtotal: payload.subtotal,
        deliveryFee: payload.deliveryFee,
        items: payload.items,
      });

      return successResponse(res, result, 'Discount applied successfully');
    } catch (error: any) {
      const message = error?.message || 'Failed to apply discount';
      return errorResponse(res, message, 400);
    }
  }
}

export default new DiscountController();

