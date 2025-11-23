import express from 'express';
import { ReturnRequestController } from '../controllers/returnRequest.controller';
import { authenticate, optionalAuthenticate, isAdmin } from '../middleware/auth.middleware';
import { adminAuditLogger } from '../middleware/audit.middleware';

const router = express.Router();
const returnRequestController = new ReturnRequestController();

// Create return request (authenticated or guest)
router.post(
  '/',
  optionalAuthenticate, // Allows guest users
  returnRequestController.createReturnRequest.bind(returnRequestController)
);

// Get return requests (user sees own, admin sees all)
router.get(
  '/',
  authenticate,
  returnRequestController.getReturnRequests.bind(returnRequestController)
);

// Get single return request
router.get(
  '/:id',
  authenticate,
  returnRequestController.getReturnRequestById.bind(returnRequestController)
);

// Update return request status (admin only)
router.patch(
  '/:id/status',
  authenticate,
  isAdmin,
  adminAuditLogger('return_requests:update'),
  returnRequestController.updateReturnRequestStatus.bind(returnRequestController)
);

// Delete return request (admin only)
router.delete(
  '/:id',
  authenticate,
  isAdmin,
  adminAuditLogger('return_requests:delete'),
  returnRequestController.deleteReturnRequest.bind(returnRequestController)
);

export default router;

