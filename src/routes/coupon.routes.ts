import { Router } from 'express';
import couponController from '../controllers/coupon.controller';
import { authenticate, isAdmin } from '../middleware/auth.middleware';
import { adminAuditLogger } from '../middleware/audit.middleware';

const router = Router();

// All routes require admin authentication
router.use(authenticate, isAdmin);

router.get(
  '/', 
  adminAuditLogger('coupons:list'),
  couponController.listCoupons.bind(couponController)
);

router.get(
  '/:id',
  adminAuditLogger('coupons:get'),
  couponController.getCoupon.bind(couponController)
);

router.post(
  '/',
  adminAuditLogger('coupons:create'),
  couponController.createCoupon.bind(couponController)
);

router.patch(
  '/:id',
  adminAuditLogger('coupons:update'),
  couponController.updateCoupon.bind(couponController)
);

router.delete(
  '/:id',
  adminAuditLogger('coupons:delete'),
  couponController.deleteCoupon.bind(couponController)
);

export default router;

