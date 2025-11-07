import { NextFunction, Response } from 'express';
import { supabaseAdmin } from '../utils/supabaseClient';
import { AuthRequest } from './auth.middleware';

export const adminAuditLogger = (label?: string) => (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  const start = Date.now();
  const actionLabel = label || `${req.method} ${req.originalUrl}`;
  const userId = req.user?.id || 'unknown';
  const role = req.user?.role || 'unknown';

  console.log('[ADMIN-ACTION] start', {
    action: actionLabel,
    userId,
    role,
    ip: req.ip,
  });

  res.on('finish', () => {
    const duration = Date.now() - start;
    const level = res.statusCode >= 400 ? 'warn' : 'info';
    const logPayload = {
      action: actionLabel,
      userId,
      role,
      statusCode: res.statusCode,
      durationMs: duration,
      ip: req.ip,
    };

    if (level === 'warn') {
      console.warn('[ADMIN-ACTION] failed', logPayload);
    } else {
      console.log('[ADMIN-ACTION] complete', logPayload);
    }

    const metadata = {
      method: req.method,
      path: req.originalUrl,
    };

    void (async () => {
      try {
        const { error } = await supabaseAdmin
          .from('admin_logs')
          .insert({
            action: actionLabel,
            user_id: userId !== 'unknown' ? userId : null,
            role,
            status_code: res.statusCode,
            duration_ms: duration,
            ip_address: req.ip,
            metadata,
          });

        if (error) {
          console.error('Failed to persist admin audit log:', error);
        }
      } catch (err) {
        console.error('Unexpected error writing admin audit log:', err);
      }
    })();
  });

  next();
};

