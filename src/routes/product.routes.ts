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
import { authenticate, isAdmin } from '../middleware/auth.middleware';

const router = Router();

// Public routes
router.get('/', getAllProducts);
router.get('/featured', getFeaturedProducts);
router.get('/categories', getAllCategories);

// Admin helper routes
router.get('/low-stock', authenticate, isAdmin, getLowStockProducts);

router.get('/:slug', getProductBySlug);

// Admin routes
router.post('/', authenticate, isAdmin, createProduct);
router.put('/:id', authenticate, isAdmin, updateProduct);
router.delete('/:id', authenticate, isAdmin, deleteProduct);

export default router;



