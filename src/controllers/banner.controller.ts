import { Request, Response } from 'express';
import { supabaseAdmin } from '../utils/supabaseClient';
import { successResponse, errorResponse } from '../utils/responseHandlers';
import { AuthRequest } from '../middleware/auth.middleware';

export const getBannersByType = async (req: Request, res: Response) => {
  try {
    const { type } = req.params;
    const currentDate = new Date().toISOString();

    let query = supabaseAdmin
      .from('banners')
      .select('*')
      .eq('type', type)
      .eq('active', true)
      .or(`start_date.is.null,start_date.lte.${currentDate}`)
      .or(`end_date.is.null,end_date.gte.${currentDate}`);

    // Try to order by 'order' column (quoted because it's a reserved keyword)
    try {
      query = query.order('order', { ascending: true });
    } catch (orderError) {
      // If ordering fails, just get the data without ordering
      console.warn('Could not order by "order" column, using unordered results');
    }

    const { data, error } = await query;

    if (error) throw error;

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

export const createBanner = async (req: AuthRequest, res: Response) => {
  try {
    const bannerData = req.body;

    // Clean up bannerData to match database schema
    // Remove invalid columns and map to correct column names
    const cleanBannerData: any = {
      title: bannerData.title,
      subtitle: bannerData.subtitle || null,
      image_url: bannerData.image_url,
      link: bannerData.link || bannerData.link_url || null, // Map link_url to link
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
    if (updates.image_url !== undefined) cleanUpdates.image_url = updates.image_url;
    if (updates.link !== undefined) cleanUpdates.link = updates.link;
    if (updates.link_url !== undefined) cleanUpdates.link = updates.link_url; // Map link_url to link
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



