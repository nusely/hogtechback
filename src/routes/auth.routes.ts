import { Router } from 'express';
import authController from '../controllers/auth.controller';
import { authRateLimiter } from '../middleware/rateLimit.middleware';
import { captchaGuard } from '../middleware/captcha.middleware';
import { validateBody } from '../middleware/validation.middleware';
import { emailOnlySchema, signUpSchema } from '../validation/schemas';

const router = Router();

// Public routes (no authentication required)
router.post(
  '/signup',
  authRateLimiter,
  captchaGuard,
  validateBody(signUpSchema),
  authController.signUp.bind(authController)
);

router.post(
  '/send-verification-email',
  authRateLimiter,
  captchaGuard,
  validateBody(emailOnlySchema),
  authController.sendVerificationEmail.bind(authController)
);

router.post(
  '/send-password-reset-email',
  authRateLimiter,
  captchaGuard,
  validateBody(emailOnlySchema),
  authController.sendPasswordResetEmail.bind(authController)
);

export default router;

