import { Router } from 'express';
import discountController from '../controllers/discount.controller';
import { validateBody } from '../middleware/validation.middleware';
import { applyDiscountSchema } from '../validation/schemas';
import { formRateLimiter } from '../middleware/rateLimit.middleware';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

router.post(
  '/apply',
  formRateLimiter,
  validateBody(applyDiscountSchema),
  discountController.applyDiscount.bind(discountController)
);

// Removed: test-apply and test-lookup routes - coupon system removed

// Diagnostic endpoint (admin only) to list available discounts
router.get(
  '/list',
  authenticate,
  discountController.listDiscounts.bind(discountController)
);

export default router;

