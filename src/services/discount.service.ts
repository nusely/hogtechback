import { supabaseAdmin } from '../utils/supabaseClient';

export interface DiscountEvaluationInput {
  code: string;
  subtotal: number;
  deliveryFee: number;
  items: Array<{
    product_id?: string | null;
    product_name: string;
    quantity: number;
    unit_price: number;
    subtotal: number;
  }>;
}

export interface DiscountEvaluationResult {
  discountId: string;
  code: string;
  type: 'percentage' | 'fixed_amount' | 'free_shipping';
  appliesTo: 'all' | 'products' | 'shipping' | 'total';
  discountAmount: number;
  adjustedDeliveryFee: number;
  metadata?: Record<string, any>;
}

interface DiscountRecord {
  id: string;
  name: string;
  description?: string | null;
  type: 'percentage' | 'fixed_amount' | 'free_shipping';
  value: number;
  minimum_amount: number;
  maximum_discount?: number | null;
  is_active: boolean;
  valid_from?: string | null;
  valid_until?: string | null;
  usage_limit?: number | null;
  used_count?: number | null;
  applies_to: 'all' | 'products' | 'shipping' | 'total';
  metadata?: Record<string, any> | null;
}

const NORMALIZED_CODE = (code: string) => code.trim().toUpperCase();

const ensurePositive = (value: number) => (Number.isFinite(value) && value > 0 ? value : 0);

const resolveBaseAmount = (
  record: DiscountRecord,
  subtotal: number,
  deliveryFee: number
) => {
  switch (record.applies_to) {
    case 'shipping':
      return ensurePositive(deliveryFee);
    case 'total':
      return ensurePositive(subtotal + deliveryFee);
    case 'products':
    case 'all':
    default:
      return ensurePositive(subtotal);
  }
};

const validateActivityWindow = (record: DiscountRecord) => {
  const now = new Date();

  if (record.valid_from) {
    const start = new Date(record.valid_from);
    if (now < start) {
      throw new Error('This discount is not active yet.');
    }
  }

  if (record.valid_until) {
    const end = new Date(record.valid_until);
    if (now > end) {
      throw new Error('This discount has expired.');
    }
  }
};

const validateUsage = (record: DiscountRecord) => {
  if (!record.usage_limit || record.usage_limit <= 0) {
    return;
  }

  const used = record.used_count || 0;
  if (used >= record.usage_limit) {
    throw new Error('This discount has reached its usage limit.');
  }
};

const clampDiscountAmount = (
  record: DiscountRecord,
  requestedAmount: number,
  baseAmount: number
) => {
  let amount = Math.min(requestedAmount, baseAmount);
  if (record.maximum_discount && record.maximum_discount > 0) {
    amount = Math.min(amount, record.maximum_discount);
  }
  return Math.max(amount, 0);
};

const computeDiscountAmount = (
  record: DiscountRecord,
  baseAmount: number,
  deliveryFee: number
) => {
  if (record.type === 'free_shipping') {
    return {
      discountAmount: ensurePositive(deliveryFee),
      adjustedDeliveryFee: 0,
    };
  }

  if (baseAmount <= 0) {
    throw new Error('Discount cannot be applied because the order amount is zero.');
  }

  if (record.type === 'percentage') {
    const rawAmount = (baseAmount * record.value) / 100;
    const discountAmount = clampDiscountAmount(record, rawAmount, baseAmount);
    return {
      discountAmount,
      adjustedDeliveryFee: deliveryFee,
    };
  }

  if (record.type === 'fixed_amount') {
    const discountAmount = clampDiscountAmount(record, record.value, baseAmount);
    const adjustedDeliveryFee =
      record.applies_to === 'shipping'
        ? Math.max(ensurePositive(deliveryFee) - discountAmount, 0)
        : deliveryFee;
    return {
      discountAmount,
      adjustedDeliveryFee,
    };
  }

  throw new Error('Unsupported discount type.');
};

const findDiscountRecord = async (code: string) => {
  const normalizedCode = NORMALIZED_CODE(code);
  
  console.log('🔍 Looking up discount code:', {
    originalCode: code,
    normalizedCode,
  });

  // 1. Try to find in coupons table first
  let couponData: any = null;
  try {
    // Try exact match on code (case-insensitive via normalized input, but DB might store mixed case)
    // We'll use ilike for case-insensitive match
    const { data: coupon, error: couponError } = await supabaseAdmin
      .from('coupons')
      .select('*')
      .eq('is_active', true)
      .ilike('code', normalizedCode)
      .maybeSingle();

    if (coupon) {
      couponData = coupon;
    } else if (couponError) {
      console.warn('Error checking coupons table:', couponError);
    }
  } catch (err) {
    console.error('Exception checking coupons table:', err);
  }

  if (couponData) {
    // Check dates
    const now = new Date();
    if (couponData.start_date && new Date(couponData.start_date) > now) {
       throw new Error('This coupon is not active yet.');
    }
    if (couponData.end_date && new Date(couponData.end_date) < now) {
       throw new Error('This coupon has expired.');
    }

    // Check usage limits
    if (couponData.usage_limit && couponData.usage_limit > 0) {
      if ((couponData.used_count || 0) >= couponData.usage_limit) {
        throw new Error('This coupon has reached its usage limit.');
      }
    }

    console.log('✅ Found valid coupon:', couponData.code);

    // Map to DiscountRecord interface
    return {
      id: couponData.id,
      name: couponData.code, // Use code as name
      description: couponData.description,
      type: couponData.discount_type,
      value: Number(couponData.discount_value),
      minimum_amount: Number(couponData.min_purchase_amount || 0),
      maximum_discount: couponData.max_discount_amount ? Number(couponData.max_discount_amount) : null,
      is_active: couponData.is_active,
      valid_from: couponData.start_date,
      valid_until: couponData.end_date,
      usage_limit: couponData.usage_limit,
      used_count: couponData.used_count,
      applies_to: 'all', // Default for now, could be enhanced based on applicable_products
      metadata: {
        is_coupon: true,
        per_user_limit: couponData.per_user_limit,
        applicable_products: couponData.applicable_products,
        applicable_categories: couponData.applicable_categories
      }
    } as DiscountRecord;
  }

  // 2. If not found in coupons, try discounts table (legacy/automatic rules)
  let { data, error } = await supabaseAdmin
    .from('discounts')
    .select('id, name, description, type, value, minimum_amount, maximum_discount, is_active, valid_from, valid_until, usage_limit, used_count, applies_to, metadata')
    .eq('is_active', true)
    .ilike('name', normalizedCode)
    .maybeSingle<DiscountRecord>();

  // If not found with ilike, try exact match
  if (!data && !error) {
    console.log('⚠️ Discount not found with ilike, trying exact match...');
    const exactMatch = await supabaseAdmin
      .from('discounts')
      .select('id, name, description, type, value, minimum_amount, maximum_discount, is_active, valid_from, valid_until, usage_limit, used_count, applies_to, metadata')
      .eq('is_active', true)
      .eq('name', normalizedCode)
      .maybeSingle<DiscountRecord>();
    
    if (exactMatch.data) {
      data = exactMatch.data;
      error = exactMatch.error;
    } else if (exactMatch.error) {
      error = exactMatch.error;
    }
  }

  if (error) {
    console.error('❌ Error looking up discount:', {
      error,
      code: normalizedCode,
      errorMessage: error.message,
      errorCode: error.code,
      errorDetails: error.details,
    });
    throw new Error('Unable to verify discount code at the moment.');
  }

  if (!data) {
    console.warn('⚠️ Discount not found:', {
      code: normalizedCode,
      searchedCode: normalizedCode,
    });
    
    // Try to find similar discounts for debugging
    const { data: sampleDiscounts } = await supabaseAdmin
      .from('discounts')
      .select('name, is_active, valid_from, valid_until')
      .limit(5);
    
    console.log('📋 Available discounts (sample):', sampleDiscounts);
    
    throw new Error(`Invalid discount code "${code}". Please check the code and try again.`);
  }

  console.log('✅ Discount found in discounts table:', {
    id: data.id,
    name: data.name,
    type: data.type,
    value: data.value,
    is_active: data.is_active,
    valid_from: data.valid_from,
    valid_until: data.valid_until,
    usage_limit: data.usage_limit,
    used_count: data.used_count,
  });

  return data;
};

export const evaluateDiscount = async (
  input: DiscountEvaluationInput
): Promise<DiscountEvaluationResult> => {
  console.log('💰 Evaluating discount:', {
    code: input.code,
    subtotal: input.subtotal,
    deliveryFee: input.deliveryFee,
    itemsCount: input.items?.length || 0,
  });

  const record = await findDiscountRecord(input.code);

  if (!record.is_active) {
    console.warn('⚠️ Discount is not active:', {
      code: input.code,
      discountId: record.id,
      is_active: record.is_active,
    });
    throw new Error('This discount is no longer active.');
  }

  try {
    validateActivityWindow(record);
  } catch (error: any) {
    console.warn('⚠️ Discount activity window validation failed:', {
      code: input.code,
      error: error.message,
      valid_from: record.valid_from,
      valid_until: record.valid_until,
      now: new Date().toISOString(),
    });
    throw error;
  }

  try {
    validateUsage(record);
  } catch (error: any) {
    console.warn('⚠️ Discount usage validation failed:', {
      code: input.code,
      error: error.message,
      usage_limit: record.usage_limit,
      used_count: record.used_count,
    });
    throw error;
  }

  // Force discounts to apply only to products (subtotal), not shipping or total
  // This ensures coupons only discount product costs
  const adjustedRecord = {
    ...record,
    applies_to: record.type === 'free_shipping' ? 'shipping' as const : 'products' as const,
  };

  const baseAmount = resolveBaseAmount(adjustedRecord, input.subtotal, input.deliveryFee);

  const minimum = ensurePositive(adjustedRecord.minimum_amount || 0);
  if (minimum > 0) {
    if (input.subtotal < minimum) {
      const errorMsg = `Discount requires a minimum product amount of GHS ${minimum.toFixed(2)}. Your current subtotal is GHS ${input.subtotal.toFixed(2)}.`;
      console.warn('⚠️ Minimum amount not met:', {
        code: input.code,
        minimum,
        subtotal: input.subtotal,
      });
      throw new Error(errorMsg);
    }
  }

  const { discountAmount, adjustedDeliveryFee } = computeDiscountAmount(
    adjustedRecord,
    baseAmount,
    input.deliveryFee
  );

  if (discountAmount <= 0) {
    console.warn('⚠️ Discount amount is zero or negative:', {
      code: input.code,
      discountAmount,
      baseAmount,
      type: adjustedRecord.type,
      value: adjustedRecord.value,
    });
    throw new Error('This discount cannot be applied to the current order.');
  }

  const result = {
    discountId: record.id,
    code: NORMALIZED_CODE(record.name || input.code),
    type: record.type,
    appliesTo: adjustedRecord.applies_to,
    discountAmount,
    adjustedDeliveryFee,
    metadata: record.metadata || undefined,
  };

  console.log('✅ Discount evaluated successfully:', {
    code: result.code,
    type: result.type,
    discountAmount: result.discountAmount,
    adjustedDeliveryFee: result.adjustedDeliveryFee,
    appliesTo: result.appliesTo,
  });

  return result;
};

export const commitDiscountUsage = async (discountId: string) => {
  if (!discountId) return;

  console.log('💾 Committing discount usage:', { discountId });

  // 1. Try to update coupon usage first
  try {
    const { data: coupon, error: couponFetchError } = await supabaseAdmin
      .from('coupons')
      .select('id, usage_limit, used_count')
      .eq('id', discountId)
      .maybeSingle();

    if (coupon) {
       const newCount = (coupon.used_count || 0) + 1;
       // Check limit again just in case
       if (coupon.usage_limit && newCount > coupon.usage_limit) {
         console.warn('⚠️ Coupon limit reached during commit:', discountId);
         return;
       }

       await supabaseAdmin
         .from('coupons')
         .update({ used_count: newCount })
         .eq('id', discountId);
       
       console.log('✅ Updated coupon usage count:', newCount);
       return;
    }
  } catch (err) {
    console.error('Error committing coupon usage:', err);
  }

  // 2. Fallback to discounts table
  const { data: record, error } = await supabaseAdmin
    .from('discounts')
    .select('id, usage_limit, used_count')
    .eq('id', discountId)
    .maybeSingle<{ id: string; usage_limit: number | null; used_count: number | null }>();

  if (error || !record) {
    console.error('❌ Failed to fetch discount for usage commit:', error);
    return;
  }

  if (record.usage_limit && record.usage_limit > 0) {
    if ((record.used_count || 0) >= record.usage_limit) {
      console.warn('⚠️ Discount usage limit reached before commit.', { discountId });
      return;
    }
  }

  const updatedCount = (record.used_count || 0) + 1;

  const query = supabaseAdmin
    .from('discounts')
    .update({ used_count: updatedCount })
    .eq('id', discountId);

  if (record.usage_limit && record.usage_limit > 0) {
    query.lt('used_count', record.usage_limit);
  }

  const { error: updateError } = await query;

  if (updateError) {
    console.error('❌ Failed to update discount usage count:', updateError);
  } else {
    console.log('✅ Discount usage count updated:', { discountId, newCount: updatedCount });
  }
};

