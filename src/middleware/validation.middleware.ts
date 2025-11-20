import { NextFunction, Request, Response } from 'express';
import { ZodSchema } from 'zod';
import { errorResponse } from '../utils/responseHandlers';

export const validateBody = <T>(schema: ZodSchema<T>) => (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const result = schema.safeParse(req.body);

  if (!result.success) {
    // Log the full Zod error for debugging
    console.error('🔴 Full Zod validation error:', JSON.stringify(result.error, null, 2));
    console.error('🔴 Zod error issues:', result.error.issues);
    
    const formatted = result.error.flatten();
    const fieldErrors = formatted.fieldErrors;
    
    // Also log nested field errors
    console.error('🔴 Field errors:', fieldErrors);
    console.error('🔴 Formatted errors:', formatted);
    
    // Build clean, serializable error object
    const cleanFieldErrors: Record<string, string[]> = {};
    Object.entries(fieldErrors).forEach(([field, errors]) => {
      if (Array.isArray(errors)) {
        cleanFieldErrors[field] = errors.map(e => String(e));
      } else if (errors) {
        cleanFieldErrors[field] = [String(errors)];
      }
    });
    
    // Also include issues for nested errors
    result.error.issues.forEach(issue => {
      const path = issue.path.join('.');
      if (!cleanFieldErrors[path]) {
        cleanFieldErrors[path] = [];
      }
      cleanFieldErrors[path].push(issue.message);
    });
    
    // Build detailed error message
    const errorMessages = Object.entries(cleanFieldErrors)
      .map(([field, errors]) => `${field}: ${errors.join(', ')}`)
      .join('; ');
    
    const errorMessage = `Invalid request body: ${errorMessages || 'Validation failed'}`;
    
    // Log validation errors for debugging
    console.error('🔴 Validation error summary:', {
      message: errorMessage,
      fieldErrors: cleanFieldErrors,
      receivedBodyKeys: Object.keys(req.body || {}),
      receivedBody: req.body, // Log full body for discount endpoint debugging
      receivedBodyType: typeof req.body,
      receivedBodySample: req.body ? {
        order_items_count: Array.isArray(req.body.order_items) ? req.body.order_items.length : 0,
        items_count: Array.isArray(req.body.items) ? req.body.items.length : typeof req.body.items,
        items_type: typeof req.body.items,
        items_value: req.body.items,
        has_delivery_address: !!req.body.delivery_address,
        payment_method: req.body.payment_method,
        code: req.body.code,
        subtotal: req.body.subtotal,
        deliveryFee: req.body.deliveryFee,
      } : null,
    });
    
    return res.status(400).json({
      success: false,
      message: errorMessage,
      error: errorMessage, // Also include as 'error' for frontend compatibility
      errors: {
        fieldErrors: cleanFieldErrors,
      },
    });
  }

  req.body = result.data as unknown as Request['body'];
  return next();
};

