import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../utils/supabaseClient';
import { errorResponse } from '../utils/responseHandlers';

export interface AuthRequest extends Request {
  user?: any;
}

export const SPECIAL_AUDIT_EMAILS = new Set([
  'superadmin@hogtechgh.com',
  'cimons@hogtechgh.com',
]);

export const authenticate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return errorResponse(res, 'Unauthorized - No token provided', 401);
    }

    const token = authHeader.substring(7);

    // Verify token with Supabase
    const {
      data: { user },
      error,
    } = await supabaseAdmin.auth.getUser(token);

    if (error || !user) {
      return errorResponse(res, 'Unauthorized - Invalid token', 401);
    }

    // Get user profile
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return errorResponse(res, 'User profile not found', 404);
    }

    req.user = profile;
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    return errorResponse(res, 'Authentication failed', 500);
  }
};

const hasAdminPrivileges = (user: any) => {
  if (!user?.role) return false;
  return user.role === 'admin' || user.role === 'superadmin';
};

export const isAdmin = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.user) {
    return errorResponse(res, 'Unauthorized', 401);
  }

  if (!hasAdminPrivileges(req.user)) {
    return errorResponse(res, 'Forbidden - Admin access required', 403);
  }

  next();
};

// Optional authentication - allows guest users but attaches user if token is provided
export const optionalAuthenticate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;

    // If no auth header, continue as guest
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      req.user = undefined;
      return next();
    }

    const token = authHeader.substring(7);

    // Verify token with Supabase
    const {
      data: { user },
      error,
    } = await supabaseAdmin.auth.getUser(token);

    // If token is invalid, continue as guest (don't fail)
    if (error || !user) {
      req.user = undefined;
      return next();
    }

    // Get user profile
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('id', user.id)
      .single();

    // If profile not found, continue as guest
    if (profileError || !profile) {
      req.user = undefined;
      return next();
    }

    req.user = profile;
    next();
  } catch (error) {
    console.error('Optional authentication error:', error);
    // On error, continue as guest
    req.user = undefined;
    next();
  }
};

