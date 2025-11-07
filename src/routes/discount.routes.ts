import { Router } from 'express';
import discountController from '../controllers/discount.controller';
import { validateBody } from '../middleware/validation.middleware';
import { applyDiscountSchema } from '../validation/schemas';
import { formRateLimiter } from '../middleware/rateLimit.middleware';

const router = Router();

router.post(
  '/apply',
  formRateLimiter,
  validateBody(applyDiscountSchema),
  discountController.applyDiscount.bind(discountController)
);

export default router;

