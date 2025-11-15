import { Request, Response, NextFunction } from 'express';
import validator from 'validator';

/**
 * Sanitizes string inputs to prevent XSS attacks
 * Removes HTML tags and escapes special characters
 */
export const sanitizeInput = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const sanitizeObject = (obj: any): any => {
    if (obj === null || obj === undefined) {
      return obj;
    }

    if (typeof obj === 'string') {
      // Remove HTML tags and escape special characters
      return validator.escape(validator.stripLow(obj));
    }

    if (Array.isArray(obj)) {
      return obj.map(sanitizeObject);
    }

    if (typeof obj === 'object') {
      const sanitized: any = {};
      for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          // Skip sanitization for certain fields that may contain HTML intentionally
          // (e.g., email templates, rich text content)
          if (
            key.includes('html') ||
            key.includes('template') ||
            key === 'description' || // Product descriptions may contain HTML
            key === 'content' ||
            key === 'body'
          ) {
            sanitized[key] = obj[key];
          } else {
            sanitized[key] = sanitizeObject(obj[key]);
          }
        }
      }
      return sanitized;
    }

    return obj;
  };

  // Sanitize request body
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeObject(req.body);
  }

  // Sanitize query parameters
  if (req.query && typeof req.query === 'object') {
    req.query = sanitizeObject(req.query) as any;
  }

  // Sanitize URL parameters
  if (req.params && typeof req.params === 'object') {
    req.params = sanitizeObject(req.params) as any;
  }

  next();
};

/**
 * Sanitizes email addresses specifically
 */
export const sanitizeEmail = (email: string): string => {
  return validator.normalizeEmail(validator.trim(email)) || email;
};

/**
 * Sanitizes URLs
 */
export const sanitizeUrl = (url: string): string => {
  return validator.escape(validator.trim(url));
};

