import { Router } from 'express';
import authController from '../controllers/auth.controller';

const router = Router();

// Public routes (no authentication required)
router.post('/signup', authController.signUp.bind(authController));
router.post('/send-verification-email', authController.sendVerificationEmail.bind(authController));
router.post('/send-password-reset-email', authController.sendPasswordResetEmail.bind(authController));

export default router;

