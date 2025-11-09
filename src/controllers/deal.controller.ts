import { Request, Response } from 'express';
import { supabaseAdmin } from '../utils/supabaseClient';
import { successResponse, errorResponse } from '../utils/responseHandlers';
import { AuthRequest } from '../middleware/auth.middleware';

// Get all deals (public - active deals only, admin - all deals)
export const getAllDeals = async (req: Request, res: Response) => {
  try {
    const { includeInactive } = req.query;
    const now = new Date().toISOString();

    let query = supabaseAdmin
      .from('deals')
      .select('*')
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: false });

    // If not admin or not including inactive, only show active deals
    if (includeInactive !== 'true') {
      query = query
        .eq('is_active', true)
        .lte('start_date', now)
        .gte('end_date', now);
    }

    const { data, error } = await query;

    if (error) throw error;

    return successResponse(res, data || [], 'Deals retrieved successfully');
  } catch (error: any) {
    console.error('Get deals error:', error);
    return errorResponse(res, error.message || 'Failed to retrieve deals');
  }
};

// Get deal by ID
export const getDealById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabaseAdmin
      .from('deals')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;

    if (!data) {
      return errorResponse(res, 'Deal not found', 404);
    }

    return successResponse(res, data, 'Deal retrieved successfully');
  } catch (error: any) {
    console.error('Get deal by ID error:', error);
    return errorResponse(res, error.message || 'Failed to retrieve deal');
  }
};

// Create deal (Admin only)
export const createDeal = async (req: AuthRequest, res: Response) => {
  try {
    const { title, description, banner_image_url, discount_percentage, start_date, end_date, is_active, display_order, is_flash_deal } = req.body;

    if (!title || !start_date || !end_date) {
      return errorResponse(res, 'Title, start date, and end date are required', 400);
    }

    // Validate date range
    if (new Date(end_date) <= new Date(start_date)) {
      return errorResponse(res, 'End date must be after start date', 400);
    }

    const { data, error } = await supabaseAdmin
      .from('deals')
      .insert([{
        title,
        description,
        banner_image_url,
        discount_percentage: discount_percentage || 0,
        start_date,
        end_date,
        is_active: is_active !== false,
        display_order: display_order || 0,
        is_flash_deal: is_flash_deal === true,
      }])
      .select()
      .single();

    if (error) throw error;

    return successResponse(res, data, 'Deal created successfully', 201);
  } catch (error: any) {
    console.error('Create deal error:', error);
    return errorResponse(res, error.message || 'Failed to create deal');
  }
};

// Update deal (Admin only)
export const updateDeal = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const normalizedUpdates: Record<string, any> = { ...updates };

    if (Object.prototype.hasOwnProperty.call(normalizedUpdates, 'stock_quantity')) {
      const rawStock = normalizedUpdates.stock_quantity;
      let parsedStock = 0;
      if (typeof rawStock === 'number' && Number.isFinite(rawStock)) {
        parsedStock = Math.max(0, Math.trunc(rawStock));
      } else if (typeof rawStock === 'string' && rawStock.trim().length > 0) {
        const parsed = parseInt(rawStock, 10);
        parsedStock = Number.isNaN(parsed) ? 0 : Math.max(0, parsed);
      }
      normalizedUpdates.stock_quantity = parsedStock;
    }

    if (Object.prototype.hasOwnProperty.call(normalizedUpdates, 'deal_price')) {
      const rawDealPrice = normalizedUpdates.deal_price;
      if (rawDealPrice === null || rawDealPrice === undefined || rawDealPrice === '') {
        normalizedUpdates.deal_price = null;
      } else {
        const parsed = typeof rawDealPrice === 'number' ? rawDealPrice : parseFloat(rawDealPrice);
        normalizedUpdates.deal_price = Number.isFinite(parsed) ? parseFloat(parsed.toFixed(2)) : null;
      }
    }

    if (Object.prototype.hasOwnProperty.call(normalizedUpdates, 'discount_percentage')) {
      const rawDiscount = normalizedUpdates.discount_percentage;
      if (rawDiscount === null || rawDiscount === undefined || rawDiscount === '') {
        normalizedUpdates.discount_percentage = 0;
      } else {
        const parsed =
          typeof rawDiscount === 'number'
            ? rawDiscount
            : parseInt(String(rawDiscount), 10);
        normalizedUpdates.discount_percentage = Number.isNaN(parsed)
          ? 0
          : Math.min(100, Math.max(0, parsed));
      }
    }

    // Validate date range if both dates are being updated
    if (updates.start_date && updates.end_date) {
      if (new Date(updates.end_date) <= new Date(updates.start_date)) {
        return errorResponse(res, 'End date must be after start date', 400);
      }
    }

    const { data, error } = await supabaseAdmin
      .from('deals')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    if (!data) {
      return errorResponse(res, 'Deal not found', 404);
    }

    return successResponse(res, data, 'Deal updated successfully');
  } catch (error: any) {
    console.error('Update deal error:', error);
    return errorResponse(res, error.message || 'Failed to update deal');
  }
};

// Delete deal (Admin only)
export const deleteDeal = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const { error } = await supabaseAdmin
      .from('deals')
      .delete()
      .eq('id', id);

    if (error) throw error;

    return successResponse(res, null, 'Deal deleted successfully', 204);
  } catch (error: any) {
    console.error('Delete deal error:', error);
    return errorResponse(res, error.message || 'Failed to delete deal');
  }
};

// Get products for a deal
export const getDealProducts = async (req: Request, res: Response) => {
  try {
    const { dealId } = req.params;

    console.log('Fetching products for deal:', dealId);

    const { data, error } = await supabaseAdmin
      .from('deal_products')
      .select(`
        *,
        product:products(*)
      `)
      .eq('deal_id', dealId)
      .order('sort_order', { ascending: true });

    if (error) {
      console.error('Error fetching deal products:', error);
      throw error;
    }

    console.log('Deal products found:', data?.length || 0, data);

    return successResponse(res, data || [], 'Deal products retrieved successfully');
  } catch (error: any) {
    console.error('Get deal products error:', error);
    return errorResponse(res, error.message || 'Failed to retrieve deal products');
  }
};

// Add product to deal (Admin only)
export const addProductToDeal = async (req: AuthRequest, res: Response) => {
  try {
    const { dealId } = req.params;
    const { 
      product_id, 
      deal_price, 
      discount_percentage, 
      sort_order, 
      is_flash_deal,
      // Standalone product fields
      product_name,
      product_description,
      product_image_url,
      product_images,
      product_key_features,
      product_specifications,
      original_price,
      stock_quantity,
    } = req.body;

    // Either product_id OR standalone product info must be provided
    if (!product_id && (!product_name || !original_price)) {
      return errorResponse(res, 'Either product_id or product_name with original_price is required', 400);
    }

    const insertData: any = {
      deal_id: dealId,
      deal_price,
      discount_percentage: discount_percentage || 0,
      sort_order: sort_order || 0,
      is_flash_deal: is_flash_deal === true,
    };

    // If product_id is provided, use it; otherwise use standalone product info
    if (product_id) {
      insertData.product_id = product_id;
    } else {
      let parsedStockQuantity = 0;
      if (typeof stock_quantity === 'number' && Number.isFinite(stock_quantity)) {
        parsedStockQuantity = Math.max(0, Math.trunc(stock_quantity));
      } else if (typeof stock_quantity === 'string' && stock_quantity.trim().length > 0) {
        const parsed = parseInt(stock_quantity, 10);
        parsedStockQuantity = Number.isNaN(parsed) ? 0 : Math.max(0, parsed);
      }

      insertData.product_name = product_name;
      insertData.product_description = product_description || null;
      insertData.product_image_url = product_image_url || null;
      insertData.product_images = product_images || null;
      insertData.product_key_features = product_key_features || null;
      insertData.product_specifications = product_specifications || null;
      insertData.original_price = parseFloat(original_price);
      insertData.stock_quantity = parsedStockQuantity;
    }

    const { data, error } = await supabaseAdmin
      .from('deal_products')
      .insert([insertData])
      .select()
      .single();

    if (error) throw error;

    return successResponse(res, data, 'Product added to deal successfully', 201);
  } catch (error: any) {
    console.error('Add product to deal error:', error);
    return errorResponse(res, error.message || 'Failed to add product to deal');
  }
};

// Update product in deal (Admin only)
export const updateDealProduct = async (req: AuthRequest, res: Response) => {
  try {
    const { dealId, productId } = req.params;
    const updates = req.body;
    const normalizedUpdates: Record<string, any> = { ...updates };

    if (Object.prototype.hasOwnProperty.call(normalizedUpdates, 'stock_quantity')) {
      const rawStock = normalizedUpdates.stock_quantity;
      let parsedStock = 0;
      if (typeof rawStock === 'number' && Number.isFinite(rawStock)) {
        parsedStock = Math.max(0, Math.trunc(rawStock));
      } else if (typeof rawStock === 'string' && rawStock.trim().length > 0) {
        const parsed = parseInt(rawStock, 10);
        parsedStock = Number.isNaN(parsed) ? 0 : Math.max(0, parsed);
      }
      normalizedUpdates.stock_quantity = parsedStock;
    }

    if (Object.prototype.hasOwnProperty.call(normalizedUpdates, 'deal_price')) {
      const rawDealPrice = normalizedUpdates.deal_price;
      if (rawDealPrice === null || rawDealPrice === undefined || rawDealPrice === '') {
        normalizedUpdates.deal_price = null;
      } else {
        const parsed =
          typeof rawDealPrice === 'number' ? rawDealPrice : parseFloat(String(rawDealPrice));
        normalizedUpdates.deal_price = Number.isFinite(parsed) ? parseFloat(parsed.toFixed(2)) : null;
      }
    }

    if (Object.prototype.hasOwnProperty.call(normalizedUpdates, 'discount_percentage')) {
      const rawDiscount = normalizedUpdates.discount_percentage;
      if (rawDiscount === null || rawDiscount === undefined || rawDiscount === '') {
        normalizedUpdates.discount_percentage = 0;
      } else {
        const parsed =
          typeof rawDiscount === 'number' ? rawDiscount : parseInt(String(rawDiscount), 10);
        normalizedUpdates.discount_percentage = Number.isNaN(parsed)
          ? 0
          : Math.min(100, Math.max(0, parsed));
      }
    }

    // First, try to find by product_id (existing products)
    const { data: existingProduct, error: checkError } = await supabaseAdmin
      .from('deal_products')
      .select('id')
      .eq('deal_id', dealId)
      .eq('product_id', productId)
      .maybeSingle();

    if (checkError && checkError.code !== 'PGRST116') { // PGRST116 is "no rows found"
      throw checkError;
    }

    let updateQuery;
    if (existingProduct) {
      // Update by product_id (existing product)
      updateQuery = supabaseAdmin
        .from('deal_products')
        .update(normalizedUpdates)
        .eq('deal_id', dealId)
        .eq('product_id', productId);
    } else {
      // Try updating by deal_product.id (standalone products)
      updateQuery = supabaseAdmin
        .from('deal_products')
        .update(normalizedUpdates)
        .eq('deal_id', dealId)
        .eq('id', productId);
    }

    const { data, error } = await updateQuery.select().single();

    if (error) throw error;

    if (!data) {
      return errorResponse(res, 'Deal product not found', 404);
    }

    return successResponse(res, data, 'Deal product updated successfully');
  } catch (error: any) {
    console.error('Update deal product error:', error);
    return errorResponse(res, error.message || 'Failed to update deal product');
  }
};

// Remove product from deal (Admin only)
export const removeProductFromDeal = async (req: AuthRequest, res: Response) => {
  try {
    const { dealId, productId } = req.params;

    // First, check if the product exists with product_id (existing product)
    const { data: existingProduct, error: checkError } = await supabaseAdmin
      .from('deal_products')
      .select('id')
      .eq('deal_id', dealId)
      .eq('product_id', productId)
      .maybeSingle();

    if (checkError && checkError.code !== 'PGRST116') {
      throw checkError;
    }

    // If found by product_id, delete by product_id
    if (existingProduct) {
      const { error: deleteError } = await supabaseAdmin
        .from('deal_products')
        .delete()
        .eq('deal_id', dealId)
        .eq('product_id', productId);

      if (deleteError) throw deleteError;
    } else {
      // Otherwise, try deleting by deal_product id (standalone product)
      const { error: deleteError } = await supabaseAdmin
        .from('deal_products')
        .delete()
        .eq('deal_id', dealId)
        .eq('id', productId);

      if (deleteError) throw deleteError;
    }

    return successResponse(res, null, 'Product removed from deal successfully', 204);
  } catch (error: any) {
    console.error('Remove product from deal error:', error);
    return errorResponse(res, error.message || 'Failed to remove product from deal');
  }
};

// Get all products in active deals (for deals page)
export const getActiveDealProducts = async (req: Request, res: Response) => {
  try {
    const now = new Date().toISOString();

    console.log('Fetching active deal products at:', now);

    // Get all active deals
    const { data: activeDeals, error: dealsError } = await supabaseAdmin
      .from('deals')
      .select('id')
      .eq('is_active', true)
      .lte('start_date', now)
      .gte('end_date', now);

    if (dealsError) {
      console.error('Error fetching active deals:', dealsError);
      throw dealsError;
    }

    console.log('Active deals found:', activeDeals?.length || 0, activeDeals);

    if (!activeDeals || activeDeals.length === 0) {
      console.log('No active deals found');
      return successResponse(res, [], 'No active deals found');
    }

    const dealIds = activeDeals.map(deal => deal.id);
    console.log('Deal IDs:', dealIds);

    // Get all products from active deals (including standalone products)
    const { data: dealProducts, error: productsError } = await supabaseAdmin
      .from('deal_products')
      .select(`
        *,
        product:products(*),
        deal:deals(id, title, discount_percentage, start_date, end_date)
      `)
      .in('deal_id', dealIds)
      .order('sort_order', { ascending: true });

    if (productsError) {
      console.error('Error fetching deal products:', productsError);
      throw productsError;
    }

    console.log('Deal products found:', dealProducts?.length || 0);
    console.log('Deal products:', dealProducts);

    return successResponse(res, dealProducts || [], 'Active deal products retrieved successfully');
  } catch (error: any) {
    console.error('Get active deal products error:', error);
    return errorResponse(res, error.message || 'Failed to retrieve active deal products');
  }
};

// Get flash deal products (for homepage)
export const getFlashDealProducts = async (req: Request, res: Response) => {
  try {
    const { limit } = req.query;
    const now = new Date().toISOString();

    console.log('Fetching flash deal products at:', now);

    // Get all active flash deals (deal must be active AND marked as flash deal)
    const { data: activeFlashDeals, error: dealsError } = await supabaseAdmin
      .from('deals')
      .select('id')
      .eq('is_active', true)
      .eq('is_flash_deal', true)
      .lte('start_date', now)
      .gte('end_date', now);

    if (dealsError) {
      console.error('Error fetching active flash deals:', dealsError);
      throw dealsError;
    }

    console.log('Active flash deals found:', activeFlashDeals?.length || 0, activeFlashDeals);

    if (!activeFlashDeals || activeFlashDeals.length === 0) {
      console.log('No active flash deals found');
      return successResponse(res, [], 'No active flash deals found');
    }

    const dealIds = activeFlashDeals.map(deal => deal.id);
    console.log('Flash deal IDs:', dealIds);

    // Get flash deal products (product must be marked as flash deal)
    let query = supabaseAdmin
      .from('deal_products')
      .select(`
        *,
        product:products(*),
        deal:deals(id, title, discount_percentage, start_date, end_date, is_flash_deal)
      `)
      .in('deal_id', dealIds)
      .eq('is_flash_deal', true)
      .order('sort_order', { ascending: true });

    if (limit) {
      query = query.limit(parseInt(limit as string));
    }

    const { data: dealProducts, error: productsError } = await query;

    if (productsError) {
      console.error('Error fetching flash deal products:', productsError);
      throw productsError;
    }

    console.log('Flash deal products found:', dealProducts?.length || 0);
    console.log('Flash deal products:', dealProducts);

    return successResponse(res, dealProducts || [], 'Flash deal products retrieved successfully');
  } catch (error: any) {
    console.error('Get flash deal products error:', error);
    return errorResponse(res, error.message || 'Failed to retrieve flash deal products');
  }
};

