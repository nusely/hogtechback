import { Router } from 'express';
import {
  getAllFlashDeals,
  getFlashDealById,
  createFlashDeal,
  updateFlashDeal,
  deleteFlashDeal,
  getFlashDealProducts,
  addProductToFlashDeal,
  removeProductFromFlashDeal,
  updateFlashDealProduct,
} from '../controllers/flashDeal.controller';
import { authenticate, isAdmin } from '../middleware/auth.middleware';

const router = Router();

// Public routes
router.get('/', getAllFlashDeals);
router.get('/:id', getFlashDealById);
router.get('/:id/products', getFlashDealProducts);

// Admin routes
router.post('/', authenticate, isAdmin, createFlashDeal);
router.put('/:id', authenticate, isAdmin, updateFlashDeal);
router.delete('/:id', authenticate, isAdmin, deleteFlashDeal);
router.post('/:id/products', authenticate, isAdmin, addProductToFlashDeal);
router.delete('/:id/products/:productId', authenticate, isAdmin, removeProductFromFlashDeal);
router.put('/:id/products/:productId', authenticate, isAdmin, updateFlashDealProduct);

export default router;

