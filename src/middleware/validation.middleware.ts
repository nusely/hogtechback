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
    const formatted = result.error.flatten();
    return errorResponse(res, 'Invalid request body', 400, formatted);
  }

  req.body = result.data as unknown as Request['body'];
  return next();
};

