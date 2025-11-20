import { Router } from 'express';
import exportController from '../controllers/export.controller';
import { authenticate, isAdmin } from '../middleware/auth.middleware';
import { adminAuditLogger } from '../middleware/audit.middleware';

const router = Router();

router.use(authenticate, isAdmin);

router.get(
  '/orders',
  adminAuditLogger('export:orders'),
  exportController.exportOrders.bind(exportController)
);

router.get(
  '/transactions',
  adminAuditLogger('export:transactions'),
  exportController.exportTransactions.bind(exportController)
);

export default router;

