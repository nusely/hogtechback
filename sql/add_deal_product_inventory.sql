-- =====================================================
-- Add inventory tracking to deal_products
-- =====================================================
-- Enables standalone deal items to manage stock levels

ALTER TABLE deal_products
ADD COLUMN IF NOT EXISTS stock_quantity INTEGER DEFAULT 0 CHECK (stock_quantity >= 0);

-- Ensure legacy rows without values are set to zero
UPDATE deal_products
SET stock_quantity = COALESCE(stock_quantity, 0);

DO $$
BEGIN
  RAISE NOTICE '✅ Added stock_quantity column to deal_products for inventory tracking.';
END $$;


