import { Router, Request, Response } from 'express';
import { sendInvestmentEmail } from '../services/email.service';
import { formRateLimiter } from '../middleware/rateLimit.middleware';
import { captchaGuard } from '../middleware/captcha.middleware';
import { validateBody } from '../middleware/validation.middleware';
import { investmentFormSchema } from '../validation/schemas';

const router = Router();

// POST /api/investment - Submit investment form
router.post('/', formRateLimiter, captchaGuard, validateBody(investmentFormSchema), async (req: Request, res: Response) => {
  try {
    const { fullName, email, phone, tier, amount, plan, message } = req.body;

    // Validate required fields
    if (!fullName || !email || !phone || !tier || !amount || !plan) {
      return res.status(400).json({
        success: false,
        error: 'All required fields must be provided',
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid email format',
      });
    }

    // Send email
    const result = await sendInvestmentEmail({
      fullName,
      email,
      phone,
      tier,
      amount,
      plan,
      message,
    });

    if (result.success) {
      return res.status(200).json({
        success: true,
        message: 'Investment request submitted successfully',
      });
    } else {
      return res.status(500).json({
        success: false,
        error: result.error || 'Failed to send investment request',
      });
    }
  } catch (error) {
    console.error('Error processing investment request:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

export default router;



