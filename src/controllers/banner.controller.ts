import { Request, Response } from 'express';
import { supabaseAdmin } from '../utils/supabaseClient';
import { successResponse, errorResponse } from '../utils/responseHandlers';
import { AuthRequest } from '../middleware/auth.middleware';

export const getBannersByType = async (req: Request, res: Response) => {
  try {
    const { type } = req.params;
    const currentDate = new Date().toISOString();

    // Build query - banners table doesn't have a 'type' column
    // Return all active banners (the 'type' parameter is ignored since column doesn't exist)
    let query = supabaseAdmin
      .from('banners')
      .select('*')
      .eq('active', true);

    // Try to add date filters if columns exist
    try {
      query = query.or(`start_date.is.null,start_date.lte.${currentDate}`);
      query = query.or(`end_date.is.null,end_date.gte.${currentDate}`);
    } catch (dateError: any) {
      // Date columns might not exist, skip date filtering
      if (dateError?.code !== '42703') {
        console.warn('Date filtering skipped - columns may not exist');
      }
    }

    // Try to order by 'order' column (quoted because it's a reserved keyword)
    try {
      query = query.order('order', { ascending: true });
    } catch (orderError: any) {
      // If ordering fails, try alternative column names
      if (orderError?.code === '42703') {
        // Column doesn't exist, try alternatives
        try {
          query = query.order('position', { ascending: true });
        } catch (positionError: any) {
          if (positionError?.code === '42703') {
            try {
              query = query.order('display_order', { ascending: true });
            } catch (displayOrderError: any) {
              if (displayOrderError?.code === '42703') {
                try {
                  query = query.order('sort_order', { ascending: true });
                } catch (sortOrderError: any) {
                  // If all ordering fails, just get the data without ordering
                  console.warn('Could not order banners, using unordered results');
                }
              }
            }
          }
        }
      } else {
        console.warn('Could not order banners:', orderError);
      }
    }

    const { data, error } = await query;

    if (error) throw error;

    // Return all active banners (no type column to filter by)
    // The frontend can filter by type client-side if needed
    return successResponse(res, data || []);
  } catch (error: any) {
    console.error('Get banners error:', error);
    return errorResponse(res, error.message);
  }
};

export const getAllBanners = async (req: AuthRequest, res: Response) => {
  try {
    // First try with ordering
    let { data, error } = await supabaseAdmin
      .from('banners')
      .select('*')
      .order('order', { ascending: true });

    // If ordering fails due to column name issue, try without ordering
    if (error && error.message?.includes('order') && error.message?.includes('does not exist')) {
      console.warn('"order" column not found, fetching without ordering');
      const result = await supabaseAdmin
        .from('banners')
        .select('*');
      
      if (result.error) throw result.error;
      // Sort manually by created_at as fallback
      const sortedData = (result.data || []).sort((a: any, b: any) => {
        const aOrder = a.order || a.position || a.display_order || 0;
        const bOrder = b.order || b.position || b.display_order || 0;
        return aOrder - bOrder;
      });
      return successResponse(res, sortedData);
    }

    if (error) throw error;

    return successResponse(res, data || []);
  } catch (error: any) {
    console.error('Get all banners error:', error);
    return errorResponse(res, error.message);
  }
};

// Helper function to sanitize and normalize URLs
const sanitizeUrl = (url: string | null | undefined): string | null => {
  if (!url || typeof url !== 'string') {
    return null;
  }
  
  // Remove HTML entities and decode
  let sanitized = url
    .replace(/&#x2F;/g, '/')  // Replace HTML entity for /
    .replace(/&#x2f;/g, '/')   // Replace lowercase HTML entity for /
    .replace(/&amp;/g, '&')   // Replace HTML entity for &
    .replace(/&lt;/g, '<')    // Replace HTML entity for <
    .replace(/&gt;/g, '>')    // Replace HTML entity for >
    .replace(/&quot;/g, '"')  // Replace HTML entity for "
    .replace(/&#39;/g, "'")   // Replace HTML entity for '
    .trim();
  
  // Remove leading & if present (malformed URL)
  if (sanitized.startsWith('&')) {
    sanitized = sanitized.substring(1);
  }
  
  // Ensure URL starts with http:// or https://
  if (sanitized && !sanitized.match(/^https?:\/\//i)) {
    // If it starts with //, add https:
    if (sanitized.startsWith('//')) {
      sanitized = `https:${sanitized}`;
    } else if (sanitized.startsWith('/')) {
      // If it's a relative URL, prepend https://files.hogtechgh.com
      sanitized = `https://files.hogtechgh.com${sanitized}`;
    } else {
      // Otherwise, prepend https://
      sanitized = `https://${sanitized}`;
    }
  }
  
  return sanitized || null;
};

export const createBanner = async (req: AuthRequest, res: Response) => {
  try {
    const bannerData = req.body;

    // Clean up bannerData to match database schema
    // Remove invalid columns and map to correct column names
    const cleanBannerData: any = {
      title: bannerData.title,
      subtitle: bannerData.subtitle || null,
      image_url: sanitizeUrl(bannerData.image_url),
      link: sanitizeUrl(bannerData.link || bannerData.link_url), // Map link_url to link
      button_text: bannerData.button_text || null,
      order: bannerData.order || bannerData.position || bannerData.display_order || 0, // Map position/display_order to order
      active: bannerData.active !== undefined ? bannerData.active : true,
      start_date: bannerData.start_date || null,
      end_date: bannerData.end_date || null,
    };

    // Only include type if the column exists (check first)
    // For now, we'll store type info in a separate column if needed, or ignore it
    // if (bannerData.type) {
    //   cleanBannerData.type = bannerData.type;
    // }

    const { data, error } = await supabaseAdmin
      .from('banners')
      .insert([cleanBannerData])
      .select()
      .single();

    if (error) throw error;

    return successResponse(res, data, 'Banner created successfully', 201);
  } catch (error: any) {
    console.error('Create banner error:', error);
    return errorResponse(res, error.message);
  }
};

export const updateBanner = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Clean up updates to match database schema
    const cleanUpdates: any = {};
    
    // Map fields to correct column names
    if (updates.title !== undefined) cleanUpdates.title = updates.title;
    if (updates.subtitle !== undefined) cleanUpdates.subtitle = updates.subtitle;
    if (updates.image_url !== undefined) cleanUpdates.image_url = sanitizeUrl(updates.image_url);
    if (updates.link !== undefined) cleanUpdates.link = sanitizeUrl(updates.link);
    if (updates.link_url !== undefined) cleanUpdates.link = sanitizeUrl(updates.link_url); // Map link_url to link
    if (updates.button_text !== undefined) cleanUpdates.button_text = updates.button_text;
    if (updates.order !== undefined) cleanUpdates.order = updates.order;
    if (updates.position !== undefined) cleanUpdates.order = updates.position; // Map position to order
    if (updates.display_order !== undefined) cleanUpdates.order = updates.display_order; // Map display_order to order
    if (updates.active !== undefined) cleanUpdates.active = updates.active;
    if (updates.start_date !== undefined) cleanUpdates.start_date = updates.start_date;
    if (updates.end_date !== undefined) cleanUpdates.end_date = updates.end_date;

    const { data, error } = await supabaseAdmin
      .from('banners')
      .update(cleanUpdates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    if (!data) {
      return errorResponse(res, 'Banner not found', 404);
    }

    return successResponse(res, data, 'Banner updated successfully');
  } catch (error: any) {
    console.error('Update banner error:', error);
    return errorResponse(res, error.message);
  }
};

export const deleteBanner = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const { error } = await supabaseAdmin.from('banners').delete().eq('id', id);

    if (error) throw error;

    return successResponse(res, null, 'Banner deleted successfully');
  } catch (error: any) {
    console.error('Delete banner error:', error);
    return errorResponse(res, error.message);
  }
};



