import { Router } from 'express';
import {
  getAllProducts,
  getProductBySlug,
  getFeaturedProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  getAllCategories,
  getLowStockProducts,
} from '../controllers/product.controller';
import { updateOptionPrice, deleteOption, deleteAttribute } from '../controllers/productVariant.controller';
import { authenticate, isAdmin } from '../middleware/auth.middleware';
import { adminAuditLogger } from '../middleware/audit.middleware';
import { publicApiRateLimiter } from '../middleware/rateLimit.middleware';
import { cacheMiddleware } from '../utils/cache';

const router = Router();

// Public routes with rate limiting and caching
router.get('/', publicApiRateLimiter, cacheMiddleware(60), getAllProducts);
router.get('/featured', publicApiRateLimiter, cacheMiddleware(120), getFeaturedProducts);
router.get('/categories', publicApiRateLimiter, cacheMiddleware(300), getAllCategories);

// Admin helper routes
router.get('/low-stock', authenticate, isAdmin, getLowStockProducts);

router.patch(
  '/variants/options/:optionId',
  authenticate,
  isAdmin,
  adminAuditLogger('products:variant-update-option-price'),
  updateOptionPrice
);

router.delete(
  '/variants/options/:optionId',
  authenticate,
  isAdmin,
  adminAuditLogger('products:variant-delete-option'),
  deleteOption
);

router.delete(
  '/variants/attributes/:attributeId',
  authenticate,
  isAdmin,
  adminAuditLogger('products:variant-delete-attribute'),
  deleteAttribute
);

router.get('/:slug', publicApiRateLimiter, cacheMiddleware(60), getProductBySlug);

// Admin routes
router.post('/', authenticate, isAdmin, createProduct);
router.put('/:id', authenticate, isAdmin, updateProduct);
router.delete('/:id', authenticate, isAdmin, deleteProduct);

export default router;



