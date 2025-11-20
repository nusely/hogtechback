import express from 'express';
import { TransactionController } from '../controllers/transaction.controller';
import { authenticate, isAdmin } from '../middleware/auth.middleware';
import { adminAuditLogger } from '../middleware/audit.middleware';

const router = express.Router();
const transactionController = new TransactionController();

// Get all transactions (admin)
router.get('/', authenticate, isAdmin, adminAuditLogger('transactions:list'), transactionController.getAllTransactions);

// Get transaction by ID
router.get(
  '/:id',
  authenticate,
  isAdmin,
  adminAuditLogger('transactions:get'),
  transactionController.getTransactionById
);

// Update transaction payment status
router.patch(
  '/:id/status',
  authenticate,
  isAdmin,
  adminAuditLogger('transactions:update-status'),
  transactionController.updateTransactionStatus.bind(transactionController)
);

export default router;

