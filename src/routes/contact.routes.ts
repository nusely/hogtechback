import express from 'express';
import { contactController } from '../controllers/contact.controller';
import { formRateLimiter } from '../middleware/rateLimit.middleware';
import { captchaGuard } from '../middleware/captcha.middleware';
import { validateBody } from '../middleware/validation.middleware';
import { contactFormSchema } from '../validation/schemas';

const router = express.Router();

// Contact form submission
router.post(
  '/',
  formRateLimiter,
  captchaGuard,
  validateBody(contactFormSchema),
  contactController.submitContactForm
);

export default router;
