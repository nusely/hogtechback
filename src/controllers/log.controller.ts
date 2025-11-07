import { Request, Response } from 'express';
import { supabaseAdmin } from '../utils/supabaseClient';
import { successResponse, errorResponse } from '../utils/responseHandlers';

export class LogController {
  async getAdminLogs(req: Request, res: Response) {
    const page = Number(req.query.page || 1);
    const limit = Math.min(Number(req.query.limit || 50), 200);
    const offset = (page - 1) * limit;

    try {
      const { data, error, count } = await supabaseAdmin
        .from('admin_logs')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        console.error('Error fetching admin logs:', error);
        return errorResponse(res, 'Failed to fetch logs', 500);
      }

      return successResponse(res, {
        logs: data || [],
        pagination: {
          page,
          limit,
          total: count || 0,
          totalPages: Math.ceil((count || 0) / limit) || 1,
        },
      });
    } catch (error) {
      console.error('Unexpected error fetching admin logs:', error);
      return errorResponse(res, 'Failed to fetch logs', 500);
    }
  }
}

export default new LogController();

