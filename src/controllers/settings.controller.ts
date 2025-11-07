import { Request, Response } from 'express';
import { supabaseAdmin } from '../utils/supabaseClient';
import { errorResponse, successResponse } from '../utils/responseHandlers';
import { settingsService } from '../services/settings.service';
import { AuthRequest } from '../middleware/auth.middleware';

export const getSettings = async (req: Request, res: Response) => {
  try {
    const { keys, category } = req.query;

    if (keys) {
      const requestedKeys = (keys as string)
        .split(',')
        .map((key) => key.trim())
        .filter(Boolean);

      if (requestedKeys.length === 0) {
        return successResponse(res, {});
      }

      const settings = await supabaseAdmin
        .from('settings')
        .select('key, value, category')
        .in('key', requestedKeys);

      if (settings.error) {
        throw settings.error;
      }

      const result: Record<string, string | null> = {};
      settings.data?.forEach((setting) => {
        result[setting.key] = setting.value;
      });

      return successResponse(res, result);
    }

    if (category) {
      const { data, error } = await supabaseAdmin
        .from('settings')
        .select('key, value, category, description')
        .eq('category', category as string);

      if (error) {
        throw error;
      }

      const result: Record<string, { value: string | null; description: string | null }> = {};

      data?.forEach((setting) => {
        result[setting.key] = {
          value: setting.value,
          description: setting.description,
        };
      });

      return successResponse(res, result);
    }

    const { data, error } = await supabaseAdmin
      .from('settings')
      .select('key, value, category, description');

    if (error) {
      throw error;
    }

    const result: Record<string, { value: string | null; category: string | null; description: string | null }> = {};

    data?.forEach((setting) => {
      result[setting.key] = {
        value: setting.value,
        category: setting.category,
        description: setting.description,
      };
    });

    return successResponse(res, result);
  } catch (error: any) {
    console.error('Error fetching settings:', error);
    return errorResponse(res, error.message || 'Failed to fetch settings');
  }
};

export const updateSettings = async (req: AuthRequest, res: Response) => {
  try {
    const { updates } = req.body as {
      updates?: Array<{ key: string; value: unknown; category?: string; description?: string }>;
    };

    if (!updates || !Array.isArray(updates) || updates.length === 0) {
      return errorResponse(res, 'No settings provided', 400);
    }

    const payload = updates.map((update) => ({
      key: update.key,
      value: update.value !== undefined && update.value !== null ? String(update.value) : null,
      category: update.category || null,
      description: update.description !== undefined ? update.description : null,
      updated_at: new Date().toISOString(),
    }));

    const { data, error } = await supabaseAdmin
      .from('settings')
      .upsert(payload, { onConflict: 'key' })
      .select('key, value, category');

    if (error) {
      throw error;
    }

    settingsService.clearCache();

    const result: Record<string, string | null> = {};
    data?.forEach((setting) => {
      result[setting.key] = setting.value;
    });

    return successResponse(res, result, 'Settings updated successfully');
  } catch (error: any) {
    console.error('Error updating settings:', error);
    return errorResponse(res, error.message || 'Failed to update settings');
  }
};

