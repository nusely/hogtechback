import { Router } from 'express';
import { getSettings, updateSettings } from '../controllers/settings.controller';
import { authenticate, isAdmin } from '../middleware/auth.middleware';

const router = Router();

router.get('/', getSettings);
router.put('/', authenticate, isAdmin, updateSettings);

export default router;

