import express from 'express';
import { OrderController } from '../controllers/order.controller';
import { authenticate, isAdmin } from '../middleware/auth.middleware';
import { checkoutRateLimiter, orderTrackRateLimiter } from '../middleware/rateLimit.middleware';
import { validateBody } from '../middleware/validation.middleware';
import { orderCreateSchema, trackOrderSchema } from '../validation/schemas';
import { adminAuditLogger } from '../middleware/audit.middleware';

const router = express.Router();
const orderController = new OrderController();

// Get all orders (admin only)
router.get(
  '/',
  authenticate,
  isAdmin,
  adminAuditLogger('orders:list'),
  orderController.getAllOrders.bind(orderController)
);

// Track order by order number and email (public, for guest customers)
router.post(
  '/track',
  orderTrackRateLimiter,
  validateBody(trackOrderSchema),
  orderController.trackOrder.bind(orderController)
);

// Download order PDF (admin or owner)
router.get(
  '/:id/pdf',
  authenticate,
  adminAuditLogger('orders:download-pdf'),
  orderController.downloadOrderPDF.bind(orderController)
);

// Get order by ID (admin or owner)
router.get(
  '/:id',
  authenticate,
  adminAuditLogger('orders:get'),
  orderController.getOrderById.bind(orderController)
);

// Update order status
router.patch(
  '/:id/status',
  authenticate,
  isAdmin,
  adminAuditLogger('orders:update-status'),
  orderController.updateOrderStatus.bind(orderController)
);

// Update payment status
router.patch(
  '/:id/payment-status',
  authenticate,
  isAdmin,
  adminAuditLogger('orders:update-payment-status'),
  orderController.updatePaymentStatus.bind(orderController)
);

// Cancel order (admin only for now)
router.patch(
  '/:id/cancel',
  authenticate,
  isAdmin,
  adminAuditLogger('orders:cancel'),
  orderController.cancelOrder.bind(orderController)
);

// Create order
router.post(
  '/',
  checkoutRateLimiter,
  validateBody(orderCreateSchema),
  orderController.createOrder.bind(orderController)
);

// Send wishlist reminder
router.post(
  '/wishlist-reminder/:user_id',
  authenticate,
  isAdmin,
  adminAuditLogger('orders:wishlist-reminder'),
  orderController.sendWishlistReminder.bind(orderController)
);

// Send cart abandonment reminder
router.post(
  '/cart-abandonment-reminder',
  authenticate,
  isAdmin,
  adminAuditLogger('orders:cart-abandonment'),
  orderController.sendCartAbandonmentReminder.bind(orderController)
);

export default router;