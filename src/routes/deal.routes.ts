import { Router } from 'express';
import {
  getAllDeals,
  getDealById,
  createDeal,
  updateDeal,
  deleteDeal,
  getDealProducts,
  addProductToDeal,
  updateDealProduct,
  removeProductFromDeal,
  getActiveDealProducts,
  getFlashDealProducts,
} from '../controllers/deal.controller';
import { authenticate, isAdmin } from '../middleware/auth.middleware';
import { publicApiRateLimiter } from '../middleware/rateLimit.middleware';

const router = Router();

// Public routes with rate limiting
router.get('/', publicApiRateLimiter, getAllDeals); // Get all active deals
router.get('/active/products', publicApiRateLimiter, getActiveDealProducts); // Get all products in active deals (for deals page)
router.get('/flash/products', publicApiRateLimiter, getFlashDealProducts); // Get flash deal products (for homepage)
router.get('/:id', publicApiRateLimiter, getDealById); // Get a single deal
router.get('/:dealId/products', publicApiRateLimiter, getDealProducts); // Get products for a specific deal

// Admin routes (require authentication and admin role)
router.post('/', authenticate, isAdmin, createDeal);
router.put('/:id', authenticate, isAdmin, updateDeal);
router.delete('/:id', authenticate, isAdmin, deleteDeal);

router.post('/:dealId/products', authenticate, isAdmin, addProductToDeal);
router.put('/:dealId/products/:productId', authenticate, isAdmin, updateDealProduct);
router.delete('/:dealId/products/:productId', authenticate, isAdmin, removeProductFromDeal);

export default router;

