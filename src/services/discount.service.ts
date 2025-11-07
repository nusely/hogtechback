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
    return {
      discountAmount,
      adjustedDeliveryFee: deliveryFee,
    };
  }

  throw new Error('Unsupported discount type.');
};

const findDiscountRecord = async (code: string) => {
  const normalizedCode = NORMALIZED_CODE(code);

  const { data, error } = await supabaseAdmin
    .from('discounts')
    .select('id, name, description, type, value, minimum_amount, maximum_discount, is_active, valid_from, valid_until, usage_limit, used_count, applies_to, metadata')
    .eq('is_active', true)
    .eq('name', normalizedCode)
    .maybeSingle<DiscountRecord>();

  if (error) {
    console.error('Error looking up discount:', error);
    throw new Error('Unable to verify discount code at the moment.');
  }

  if (!data) {
    throw new Error('Invalid discount code.');
  }

  return data;
};

export const evaluateDiscount = async (
  input: DiscountEvaluationInput
): Promise<DiscountEvaluationResult> => {
  const record = await findDiscountRecord(input.code);

  if (!record.is_active) {
    throw new Error('This discount is no longer active.');
  }

  validateActivityWindow(record);
  validateUsage(record);

  const baseAmount = resolveBaseAmount(record, input.subtotal, input.deliveryFee);

  const minimum = ensurePositive(record.minimum_amount || 0);
  if (minimum > 0) {
    const comparator = record.applies_to === 'shipping' ? input.deliveryFee : input.subtotal;
    if (comparator < minimum) {
      throw new Error(`Discount requires a minimum order amount of ${minimum.toFixed(2)}.`);
    }
  }

  const { discountAmount, adjustedDeliveryFee } = computeDiscountAmount(
    record,
    baseAmount,
    input.deliveryFee
  );

  if (discountAmount <= 0) {
    throw new Error('This discount cannot be applied to the current order.');
  }

  return {
    discountId: record.id,
    code: NORMALIZED_CODE(record.name || input.code),
    type: record.type,
    appliesTo: record.applies_to,
    discountAmount,
    adjustedDeliveryFee,
    metadata: record.metadata || undefined,
  };
};

export const commitDiscountUsage = async (discountId: string) => {
  if (!discountId) return;

  const { data: record, error } = await supabaseAdmin
    .from('discounts')
    .select('id, usage_limit, used_count')
    .eq('id', discountId)
    .maybeSingle<{ id: string; usage_limit: number | null; used_count: number | null }>();

  if (error || !record) {
    console.error('Failed to fetch discount for usage commit:', error);
    return;
  }

  if (record.usage_limit && record.usage_limit > 0) {
    if ((record.used_count || 0) >= record.usage_limit) {
      console.warn('Discount usage limit reached before commit.', { discountId });
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
    console.error('Failed to update discount usage count:', updateError);
  }
};

