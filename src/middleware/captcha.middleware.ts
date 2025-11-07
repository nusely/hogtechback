import axios from 'axios';
import { NextFunction, Request, Response } from 'express';
import { errorResponse } from '../utils/responseHandlers';

const HCAPTCHA_SECRET = process.env.HCAPTCHA_SECRET_KEY || process.env.HCAPTCHA_SECRET;
const RECAPTCHA_SECRET = process.env.RECAPTCHA_SECRET_KEY || process.env.RECAPTCHA_SECRET;

const verifyWithProvider = async (url: string, payload: Record<string, string>) => {
  const params = new URLSearchParams(payload);
  const response = await axios.post(url, params.toString(), {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  });

  return response.data;
};

export const captchaGuard = async (req: Request, res: Response, next: NextFunction) => {
  // If no captcha secret is configured, allow the request (feature disabled)
  if (!HCAPTCHA_SECRET && !RECAPTCHA_SECRET) {
    return next();
  }

  const token =
    (req.body && (req.body.captchaToken || req.body.hcaptchaToken || req.body.recaptchaToken)) ||
    req.headers['x-captcha-token'];

  if (!token || typeof token !== 'string') {
    return errorResponse(res, 'Captcha verification failed. Token is required.', 400);
  }

  try {
    if (HCAPTCHA_SECRET) {
      const verification = await verifyWithProvider('https://hcaptcha.com/siteverify', {
        secret: HCAPTCHA_SECRET,
        response: token,
        remoteip: req.ip || '',
      });

      if (!verification?.success) {
        console.warn('HCaptcha verification failed:', verification?.['error-codes'] || verification);
        return errorResponse(res, 'Captcha verification failed.', 400);
      }
    } else if (RECAPTCHA_SECRET) {
      const verification = await verifyWithProvider('https://www.google.com/recaptcha/api/siteverify', {
        secret: RECAPTCHA_SECRET,
        response: token,
        remoteip: req.ip || '',
      });

      if (!verification?.success) {
        console.warn('reCAPTCHA verification failed:', verification?.['error-codes'] || verification);
        return errorResponse(res, 'Captcha verification failed.', 400);
      }
    }

    return next();
  } catch (error) {
    console.error('Captcha verification error:', error);
    return errorResponse(res, 'Captcha verification failed. Please try again.', 400);
  }
};

