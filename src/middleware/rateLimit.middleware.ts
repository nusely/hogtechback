import rateLimit from 'express-rate-limit';

const createLimiter = ({
  windowMs,
  max,
  message,
}: {
  windowMs: number;
  max: number;
  message: string;
}) =>
  rateLimit({
    standardHeaders: true,
    legacyHeaders: false,
    windowMs,
    max,
    handler: (req, res) => {
      console.warn('Rate limit exceeded', {
        path: req.originalUrl,
        ip: req.ip,
      });
      res.status(429).json({
        success: false,
        message,
      });
    },
  });

export const authRateLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many authentication attempts. Please try again in a few minutes.',
});

export const formRateLimiter = createLimiter({
  windowMs: 10 * 60 * 1000,
  max: 5,
  message: 'You have reached the submission limit. Please try again later.',
});

export const orderTrackRateLimiter = createLimiter({
  windowMs: 5 * 60 * 1000,
  max: 5,
  message: 'Too many order tracking attempts. Please wait a moment and try again.',
});

export const paymentVerifyRateLimiter = createLimiter({
  windowMs: 5 * 60 * 1000,
  max: 30,
  message: 'Too many payment verification attempts. Please wait and try again.',
});

export const checkoutRateLimiter = createLimiter({
  windowMs: 2 * 60 * 1000,
  max: 8,
  message: 'Too many checkout attempts. Please wait a moment before trying again.',
});

