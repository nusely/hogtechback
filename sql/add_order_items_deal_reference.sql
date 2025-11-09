-- =====================================================
-- Link order_items to deal_products for standalone deals
-- =====================================================

ALTER TABLE order_items
ADD COLUMN IF NOT EXISTS deal_product_id UUID REFERENCES deal_products(id);

-- Optional metadata for storing standalone snapshot data
ALTER TABLE order_items
ADD COLUMN IF NOT EXISTS deal_snapshot JSONB;

DO $$
BEGIN
  RAISE NOTICE '✅ order_items now tracks deal_product_id and snapshot data.';
END $$;


