import { Router } from 'express';
import logController from '../controllers/log.controller';
import { authenticate, isSuperAdmin } from '../middleware/auth.middleware';

const router = Router();

router.get('/', authenticate, isSuperAdmin, logController.getAdminLogs.bind(logController));

export default router;

