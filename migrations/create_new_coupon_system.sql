-- Create coupons table for the new robust coupon system
CREATE TABLE IF NOT EXISTS public.coupons (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  description TEXT,
  discount_type TEXT NOT NULL CHECK (discount_type IN ('percentage', 'fixed_amount', 'free_shipping')),
  discount_value DECIMAL(10, 2) NOT NULL DEFAULT 0 CHECK (discount_value >= 0),
  min_purchase_amount DECIMAL(10, 2) DEFAULT 0 CHECK (min_purchase_amount >= 0),
  max_discount_amount DECIMAL(10, 2) CHECK (max_discount_amount >= 0),
  start_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  end_date TIMESTAMPTZ,
  usage_limit INTEGER CHECK (usage_limit > 0),
  used_count INTEGER DEFAULT 0 CHECK (used_count >= 0),
  per_user_limit INTEGER CHECK (per_user_limit > 0),
  is_active BOOLEAN DEFAULT true,
  applicable_products UUID[] DEFAULT NULL, -- Array of product IDs (optional)
  applicable_categories TEXT[] DEFAULT NULL, -- Array of category names/IDs (optional)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for fast lookup (case-insensitive search handled in query usually, but index helps)
CREATE INDEX IF NOT EXISTS idx_coupons_code ON public.coupons (code);
CREATE INDEX IF NOT EXISTS idx_coupons_active ON public.coupons (is_active);

-- Enable Row Level Security (RLS)
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;

-- Policy: Everyone can read active coupons (for validation)
CREATE POLICY "Everyone can read coupons" ON public.coupons
  FOR SELECT USING (true);

-- Policy: Only admins can insert/update/delete (handled by service role usually, but good practice)
-- Note: Supabase admin client bypasses RLS, so this is for client-side if needed.

-- Add trigger for updated_at if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_coupons_updated_at') THEN
        CREATE TRIGGER update_coupons_updated_at
            BEFORE UPDATE ON public.coupons
            FOR EACH ROW
            EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;

