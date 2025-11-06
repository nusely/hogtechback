import { Request, Response } from 'express';
import { supabaseAdmin } from '../utils/supabaseClient';
import { successResponse, errorResponse } from '../utils/responseHandlers';
import { AuthRequest } from '../middleware/auth.middleware';

// Get all flash deals (public - active deals only)
export const getAllFlashDeals = async (req: Request, res: Response) => {
  try {
    const { includeInactive } = req.query;
    const now = new Date().toISOString();

    let query = supabaseAdmin
      .from('flash_deals')
      .select('*')
      .order('start_time', { ascending: true });

    // If not admin or not including inactive, only show active deals
    if (includeInactive !== 'true') {
      query = query
        .eq('is_active', true)
        .lte('start_time', now)
        .gte('end_time', now);
    }

    const { data, error } = await query;

    if (error) throw error;

    return successResponse(res, data || [], 'Flash deals retrieved successfully');
  } catch (error: any) {
    console.error('Get flash deals error:', error);
    return errorResponse(res, error.message || 'Failed to retrieve flash deals');
  }
};

// Get flash deal by ID
export const getFlashDealById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabaseAdmin
      .from('flash_deals')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;

    if (!data) {
      return errorResponse(res, 'Flash deal not found', 404);
    }

    return successResponse(res, data, 'Flash deal retrieved successfully');
  } catch (error: any) {
    console.error('Get flash deal error:', error);
    return errorResponse(res, error.message || 'Failed to retrieve flash deal');
  }
};

// Create flash deal (admin only)
export const createFlashDeal = async (req: AuthRequest, res: Response) => {
  try {
    const { title, description, banner_image_url, start_time, end_time, is_active } = req.body;

    // Validate required fields
    if (!title || !start_time || !end_time) {
      return errorResponse(res, 'Title, start_time, and end_time are required', 400);
    }

    // Validate time range
    if (new Date(end_time) <= new Date(start_time)) {
      return errorResponse(res, 'End time must be after start time', 400);
    }

    const { data, error } = await supabaseAdmin
      .from('flash_deals')
      .insert([
        {
          title,
          description,
          banner_image_url,
          start_time,
          end_time,
          is_active: is_active !== undefined ? is_active : true,
        },
      ])
      .select()
      .single();

    if (error) throw error;

    return successResponse(res, data, 'Flash deal created successfully', 201);
  } catch (error: any) {
    console.error('Create flash deal error:', error);
    return errorResponse(res, error.message || 'Failed to create flash deal');
  }
};

// Update flash deal (admin only)
export const updateFlashDeal = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { title, description, banner_image_url, start_time, end_time, is_active } = req.body;

    // Validate time range if both times are provided
    if (start_time && end_time && new Date(end_time) <= new Date(start_time)) {
      return errorResponse(res, 'End time must be after start time', 400);
    }

    const updates: any = {};
    if (title !== undefined) updates.title = title;
    if (description !== undefined) updates.description = description;
    if (banner_image_url !== undefined) updates.banner_image_url = banner_image_url;
    if (start_time !== undefined) updates.start_time = start_time;
    if (end_time !== undefined) updates.end_time = end_time;
    if (is_active !== undefined) updates.is_active = is_active;
    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabaseAdmin
      .from('flash_deals')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    if (!data) {
      return errorResponse(res, 'Flash deal not found', 404);
    }

    return successResponse(res, data, 'Flash deal updated successfully');
  } catch (error: any) {
    console.error('Update flash deal error:', error);
    return errorResponse(res, error.message || 'Failed to update flash deal');
  }
};

// Delete flash deal (admin only)
export const deleteFlashDeal = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const { error } = await supabaseAdmin
      .from('flash_deals')
      .delete()
      .eq('id', id);

    if (error) throw error;

    return successResponse(res, null, 'Flash deal deleted successfully');
  } catch (error: any) {
    console.error('Delete flash deal error:', error);
    return errorResponse(res, error.message || 'Failed to delete flash deal');
  }
};

// Get products in a flash deal
export const getFlashDealProducts = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabaseAdmin
      .from('flash_deal_products')
      .select(`
        *,
        product:products(
          *,
          category:categories!products_category_id_fkey(*),
          brand:brands!products_brand_id_fkey(*)
        )
      `)
      .eq('flash_deal_id', id)
      .order('sort_order', { ascending: true });

    if (error) throw error;

    return successResponse(res, data || [], 'Flash deal products retrieved successfully');
  } catch (error: any) {
    console.error('Get flash deal products error:', error);
    return errorResponse(res, error.message || 'Failed to retrieve flash deal products');
  }
};

// Add product to flash deal (admin only)
export const addProductToFlashDeal = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params; // flash_deal_id
    const { product_id, discount_percentage, flash_price, sort_order } = req.body;

    // Validate required fields
    if (!product_id || discount_percentage === undefined) {
      return errorResponse(res, 'product_id and discount_percentage are required', 400);
    }

    // Validate discount percentage
    if (discount_percentage < 0 || discount_percentage > 100) {
      return errorResponse(res, 'discount_percentage must be between 0 and 100', 400);
    }

    // Check if product exists
    const { data: product, error: productError } = await supabaseAdmin
      .from('products')
      .select('id, price')
      .eq('id', product_id)
      .single();

    if (productError || !product) {
      return errorResponse(res, 'Product not found', 404);
    }

    // Check if product is already in this deal
    const { data: existing, error: existingError } = await supabaseAdmin
      .from('flash_deal_products')
      .select('id')
      .eq('flash_deal_id', id)
      .eq('product_id', product_id)
      .single();

    if (existing) {
      return errorResponse(res, 'Product is already in this flash deal', 400);
    }

    // Insert product into flash deal
    const { data, error } = await supabaseAdmin
      .from('flash_deal_products')
      .insert([
        {
          flash_deal_id: id,
          product_id,
          discount_percentage,
          flash_price: flash_price || null,
          sort_order: sort_order || 0,
        },
      ])
      .select()
      .single();

    if (error) throw error;

    return successResponse(res, data, 'Product added to flash deal successfully', 201);
  } catch (error: any) {
    console.error('Add product to flash deal error:', error);
    return errorResponse(res, error.message || 'Failed to add product to flash deal');
  }
};

// Remove product from flash deal (admin only)
export const removeProductFromFlashDeal = async (req: AuthRequest, res: Response) => {
  try {
    const { id, productId } = req.params; // id = flash_deal_id, productId = product_id

    const { error } = await supabaseAdmin
      .from('flash_deal_products')
      .delete()
      .eq('flash_deal_id', id)
      .eq('product_id', productId);

    if (error) throw error;

    return successResponse(res, null, 'Product removed from flash deal successfully');
  } catch (error: any) {
    console.error('Remove product from flash deal error:', error);
    return errorResponse(res, error.message || 'Failed to remove product from flash deal');
  }
};

// Update product in flash deal (admin only)
export const updateFlashDealProduct = async (req: AuthRequest, res: Response) => {
  try {
    const { id, productId } = req.params; // id = flash_deal_id, productId = product_id
    const { discount_percentage, flash_price, sort_order } = req.body;

    const updates: any = {};
    if (discount_percentage !== undefined) {
      if (discount_percentage < 0 || discount_percentage > 100) {
        return errorResponse(res, 'discount_percentage must be between 0 and 100', 400);
      }
      updates.discount_percentage = discount_percentage;
    }
    if (flash_price !== undefined) updates.flash_price = flash_price;
    if (sort_order !== undefined) updates.sort_order = sort_order;

    const { data, error } = await supabaseAdmin
      .from('flash_deal_products')
      .update(updates)
      .eq('flash_deal_id', id)
      .eq('product_id', productId)
      .select()
      .single();

    if (error) throw error;

    if (!data) {
      return errorResponse(res, 'Flash deal product not found', 404);
    }

    return successResponse(res, data, 'Flash deal product updated successfully');
  } catch (error: any) {
    console.error('Update flash deal product error:', error);
    return errorResponse(res, error.message || 'Failed to update flash deal product');
  }
};

