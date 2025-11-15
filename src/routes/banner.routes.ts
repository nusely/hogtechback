import { Router } from 'express';
import {
  getBannersByType,
  getAllBanners,
  createBanner,
  updateBanner,
  deleteBanner,
} from '../controllers/banner.controller';
import { authenticate, isAdmin } from '../middleware/auth.middleware';
import { publicApiRateLimiter } from '../middleware/rateLimit.middleware';

const router = Router();

// Admin routes (must come before /:type to avoid route conflict)
router.get('/', authenticate, isAdmin, getAllBanners);
router.post('/', authenticate, isAdmin, createBanner);
router.put('/:id', authenticate, isAdmin, updateBanner);
router.delete('/:id', authenticate, isAdmin, deleteBanner);

// Public routes (must come after specific routes) with rate limiting
router.get('/:type', publicApiRateLimiter, getBannersByType);

export default router;



