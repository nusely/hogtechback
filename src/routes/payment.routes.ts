import express from 'express';
import { PaymentController } from '../controllers/payment.controller';
import { authenticate, isAdmin } from '../middleware/auth.middleware';
import { paymentVerifyRateLimiter } from '../middleware/rateLimit.middleware';
import { validateBody } from '../middleware/validation.middleware';
import { paymentVerifySchema } from '../validation/schemas';
import { adminAuditLogger } from '../middleware/audit.middleware';

const router = express.Router();
const paymentController = new PaymentController();

// Initialize Paystack transaction
router.post('/initialize', paymentController.initializeTransaction);

// Verify Paystack transaction
router.post(
  '/verify',
  paymentVerifyRateLimiter,
  validateBody(paymentVerifySchema),
  paymentController.verifyTransaction
);

// Paystack webhook (for automatic order creation)
router.post('/webhook', paymentController.handleWebhook);

// Update transaction-order link (admin only)
router.post(
  '/update-order-link',
  authenticate,
  isAdmin,
  adminAuditLogger('payments:update-order-link'),
  paymentController.updateOrderLink
);

export default router;

