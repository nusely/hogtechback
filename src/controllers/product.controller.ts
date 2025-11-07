import { Request, Response } from 'express';
import { supabaseAdmin } from '../utils/supabaseClient';
import { successResponse, errorResponse, paginatedResponse } from '../utils/responseHandlers';
import { AuthRequest } from '../middleware/auth.middleware';
import { settingsService } from '../services/settings.service';

export const getAllProducts = async (req: Request, res: Response) => {
  try {
    const {
      page = 1,
      limit = 12,
      category,
      brand,
      minPrice,
      maxPrice,
      inStock,
      rating,
      search,
      sortBy = 'created_at',
      sortOrder = 'desc',
    } = req.query;

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const offset = (pageNum - 1) * limitNum;

    let query = supabaseAdmin
      .from('products')
      .select('*, category:categories(name, slug)', { count: 'exact' });

    // Apply filters
    if (category) {
      query = query.eq('category_id', category);
    }

    if (brand) {
      const brands = (brand as string).split(',');
      query = query.in('brand', brands);
    }

    if (minPrice) {
      query = query.gte('discount_price', parseFloat(minPrice as string));
    }

    if (maxPrice) {
      query = query.lte('discount_price', parseFloat(maxPrice as string));
    }

    if (inStock === 'true') {
      query = query.eq('in_stock', true).gt('stock_quantity', 0);
    }

    if (rating) {
      query = query.gte('rating', parseFloat(rating as string));
    }

    if (search) {
      query = query.or(
        `name.ilike.%${search}%,description.ilike.%${search}%,brand.ilike.%${search}%`
      );
    }

    // Apply sorting
    const ascending = sortOrder === 'asc';
    query = query.order(sortBy as string, { ascending });

    // Apply pagination
    query = query.range(offset, offset + limitNum - 1);

    const { data, error, count } = await query;

    if (error) throw error;

    return paginatedResponse(res, data || [], {
      page: pageNum,
      limit: limitNum,
      total: count || 0,
      totalPages: Math.ceil((count || 0) / limitNum),
    });
  } catch (error: any) {
    console.error('Get products error:', error);
    return errorResponse(res, error.message);
  }
};

export const getProductBySlug = async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;

    const { data, error } = await supabaseAdmin
      .from('products')
      .select('*, category:categories(*), variants:product_variants(*)')
      .eq('slug', slug)
      .single();

    if (error) throw error;
    if (!data) {
      return errorResponse(res, 'Product not found', 404);
    }

    return successResponse(res, data);
  } catch (error: any) {
    console.error('Get product error:', error);
    return errorResponse(res, error.message);
  }
};

export const getFeaturedProducts = async (req: Request, res: Response) => {
  try {
    const { limit = 8 } = req.query;

    const { data, error } = await supabaseAdmin
      .from('products')
      .select('*')
      .eq('featured', true)
      .eq('in_stock', true)
      .limit(parseInt(limit as string))
      .order('created_at', { ascending: false });

    if (error) throw error;

    return successResponse(res, data || []);
  } catch (error: any) {
    console.error('Get featured products error:', error);
    return errorResponse(res, error.message);
  }
};

export const createProduct = async (req: AuthRequest, res: Response) => {
  try {
    const productData = req.body;

    const { data, error } = await supabaseAdmin
      .from('products')
      .insert([productData])
      .select()
      .single();

    if (error) throw error;

    return successResponse(res, data, 'Product created successfully', 201);
  } catch (error: any) {
    console.error('Create product error:', error);
    return errorResponse(res, error.message);
  }
};

export const updateProduct = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const { data, error } = await supabaseAdmin
      .from('products')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    if (!data) {
      return errorResponse(res, 'Product not found', 404);
    }

    return successResponse(res, data, 'Product updated successfully');
  } catch (error: any) {
    console.error('Update product error:', error);
    return errorResponse(res, error.message);
  }
};

export const deleteProduct = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const { error } = await supabaseAdmin.from('products').delete().eq('id', id);

    if (error) throw error;

    return successResponse(res, null, 'Product deleted successfully');
  } catch (error: any) {
    console.error('Delete product error:', error);
    return errorResponse(res, error.message);
  }
};

export const getAllCategories = async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('categories')
      .select('*')
      .order('order', { ascending: true });

    if (error) throw error;

    return successResponse(res, data || []);
  } catch (error: any) {
    console.error('Get categories error:', error);
    return errorResponse(res, error.message);
  }
};

const getLowStockThreshold = async (): Promise<number> => {
  const value = await settingsService.getSetting('inventory_low_stock_threshold');
  const parsed = parseInt(value || '', 10);
  if (!Number.isNaN(parsed) && parsed > 0) {
    return parsed;
  }
  return 3;
};

export const getLowStockProducts = async (req: AuthRequest, res: Response) => {
  try {
    const threshold = await getLowStockThreshold();

    const { data, error } = await supabaseAdmin
      .from('products')
      .select(
        `id,
         name,
         stock_quantity,
         in_stock,
         sku,
         thumbnail,
         images,
         original_price,
         discount_price,
         category:categories(name)`
      )
      .lte('stock_quantity', threshold)
      .eq('in_stock', true)
      .order('stock_quantity', { ascending: true })
      .limit(100);

    if (error) {
      throw error;
    }

    return successResponse(res, {
      threshold,
      count: data?.length || 0,
      products: data || [],
    });
  } catch (error: any) {
    console.error('Get low stock products error:', error);
    return errorResponse(res, error.message || 'Failed to fetch low stock products');
  }
};



