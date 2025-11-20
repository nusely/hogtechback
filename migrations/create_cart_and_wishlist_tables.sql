-- =============================================
-- CART ITEMS AND WISHLIST TABLES
-- For Abandoned Cart Analytics and Wishlist Features
-- =============================================

-- =============================================
-- 1. CART ITEMS TABLE
-- =============================================
-- Drop existing table if needed (use with caution in production)
-- DROP TABLE IF EXISTS cart_items CASCADE;

CREATE TABLE IF NOT EXISTS cart_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  selected_variants JSONB DEFAULT '{}',
  price_at_addition NUMERIC(10, 2), -- Store price when added for accurate abandoned cart value
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  
  -- Ensure valid data
  CONSTRAINT valid_quantity CHECK (quantity > 0)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_cart_items_user_id ON cart_items(user_id);
CREATE INDEX IF NOT EXISTS idx_cart_items_updated_at ON cart_items(updated_at);
CREATE INDEX IF NOT EXISTS idx_cart_items_product_id ON cart_items(product_id);
CREATE INDEX IF NOT EXISTS idx_cart_items_created_at ON cart_items(created_at);

-- Composite index for abandoned cart queries
CREATE INDEX IF NOT EXISTS idx_cart_items_user_updated ON cart_items(user_id, updated_at);

-- Enable Row Level Security
ALTER TABLE cart_items ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "Users can view their own cart items" ON cart_items;
CREATE POLICY "Users can view their own cart items" ON cart_items
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own cart items" ON cart_items;
CREATE POLICY "Users can insert their own cart items" ON cart_items
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own cart items" ON cart_items;
CREATE POLICY "Users can update their own cart items" ON cart_items
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own cart items" ON cart_items;
CREATE POLICY "Users can delete their own cart items" ON cart_items
  FOR DELETE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can view all cart items" ON cart_items;
CREATE POLICY "Admins can view all cart items" ON cart_items
  FOR SELECT USING (
    auth.uid() IN (
      SELECT id FROM users WHERE role IN ('admin', 'superadmin')
    )
  );

-- Update trigger for updated_at
CREATE OR REPLACE FUNCTION update_cart_items_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS cart_items_updated_at ON cart_items;
CREATE TRIGGER cart_items_updated_at
  BEFORE UPDATE ON cart_items
  FOR EACH ROW
  EXECUTE FUNCTION update_cart_items_updated_at();

-- =============================================
-- 2. WISHLIST TABLE
-- =============================================
-- Drop existing table if needed (use with caution in production)
-- DROP TABLE IF EXISTS wishlist CASCADE;

CREATE TABLE IF NOT EXISTS wishlist (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  purchased BOOLEAN DEFAULT FALSE,
  purchased_at TIMESTAMP WITH TIME ZONE,
  notified_on_sale BOOLEAN DEFAULT FALSE,
  notified_on_stock BOOLEAN DEFAULT FALSE,
  
  -- Ensure one product per user in wishlist
  UNIQUE(user_id, product_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_wishlist_user_id ON wishlist(user_id);
CREATE INDEX IF NOT EXISTS idx_wishlist_product_id ON wishlist(product_id);
CREATE INDEX IF NOT EXISTS idx_wishlist_created_at ON wishlist(created_at);
CREATE INDEX IF NOT EXISTS idx_wishlist_updated_at ON wishlist(updated_at);
CREATE INDEX IF NOT EXISTS idx_wishlist_purchased ON wishlist(purchased);

-- Composite index for analytics queries
CREATE INDEX IF NOT EXISTS idx_wishlist_user_purchased ON wishlist(user_id, purchased);

-- Enable Row Level Security
ALTER TABLE wishlist ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "Users can view their own wishlist" ON wishlist;
CREATE POLICY "Users can view their own wishlist" ON wishlist
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can manage their own wishlist" ON wishlist;
CREATE POLICY "Users can manage their own wishlist" ON wishlist
  FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can view all wishlists" ON wishlist;
CREATE POLICY "Admins can view all wishlists" ON wishlist
  FOR SELECT USING (
    auth.uid() IN (
      SELECT id FROM users WHERE role IN ('admin', 'superadmin')
    )
  );

-- Update trigger for updated_at
CREATE OR REPLACE FUNCTION update_wishlist_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS wishlist_updated_at ON wishlist;
CREATE TRIGGER wishlist_updated_at
  BEFORE UPDATE ON wishlist
  FOR EACH ROW
  EXECUTE FUNCTION update_wishlist_updated_at();

-- =============================================
-- 3. HELPER VIEWS (Optional but useful)
-- =============================================

-- View for abandoned carts (12 hours idle)
-- Note: This view will be created after verifying column names exist
-- Skip if columns don't match your schema
DO $$
BEGIN
  -- Check if required columns exist before creating view
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' AND column_name = 'email'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'products' AND column_name = 'name'
  ) THEN
    
    -- Create or replace the view
    EXECUTE '
    CREATE OR REPLACE VIEW abandoned_carts_12h AS
    SELECT 
      ci.id,
      ci.user_id,
      u.email as customer_email,
      COALESCE(u.full_name, CONCAT(COALESCE(u.first_name, ''''), '' '', COALESCE(u.last_name, '''')), ''Guest'') as customer_name,
      ci.product_id,
      p.name as product_name,
      ci.quantity,
      ci.selected_variants,
      COALESCE(
        ci.price_at_addition, 
        CASE WHEN p.discount_price IS NOT NULL AND p.discount_price > 0 THEN p.discount_price ELSE p.price END,
        0
      ) as unit_price,
      COALESCE(
        ci.price_at_addition, 
        CASE WHEN p.discount_price IS NOT NULL AND p.discount_price > 0 THEN p.discount_price ELSE p.price END,
        0
      ) * ci.quantity as cart_value,
      ci.created_at,
      ci.updated_at,
      EXTRACT(EPOCH FROM (NOW() - ci.updated_at))/3600 as hours_idle
    FROM cart_items ci
    LEFT JOIN users u ON ci.user_id = u.id
    LEFT JOIN products p ON ci.product_id = p.id
    WHERE ci.updated_at < NOW() - INTERVAL ''12 hours''
    ORDER BY ci.updated_at DESC
    ';
    
    RAISE NOTICE '✅ View "abandoned_carts_12h" created successfully';
  ELSE
    RAISE NOTICE '⚠️  Skipped creating abandoned_carts_12h view - verify your schema columns';
  END IF;
END $$;

-- View for wishlist analytics
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' AND column_name = 'email'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'products' AND column_name = 'name'
  ) THEN
    
    EXECUTE '
    CREATE OR REPLACE VIEW wishlist_analytics AS
    SELECT 
      w.id,
      w.user_id,
      u.email as customer_email,
      COALESCE(u.full_name, CONCAT(COALESCE(u.first_name, ''''), '' '', COALESCE(u.last_name, ''''))) as customer_name,
      w.product_id,
      p.name as product_name,
      p.price as product_price,
      p.discount_price as product_discount_price,
      p.in_stock,
      w.created_at as wishlisted_at,
      w.updated_at,
      w.purchased,
      w.purchased_at,
      EXTRACT(EPOCH FROM (NOW() - w.created_at))/86400 as days_in_wishlist
    FROM wishlist w
    LEFT JOIN users u ON w.user_id = u.id
    LEFT JOIN products p ON w.product_id = p.id
    ORDER BY w.created_at DESC
    ';
    
    RAISE NOTICE '✅ View "wishlist_analytics" created successfully';
  ELSE
    RAISE NOTICE '⚠️  Skipped creating wishlist_analytics view - verify your schema columns';
  END IF;
END $$;

-- =============================================
-- 4. CLEANUP FUNCTION (Optional)
-- =============================================
-- Function to clean up old completed carts (carts from users who completed orders)
CREATE OR REPLACE FUNCTION cleanup_completed_carts()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM cart_items ci
  WHERE EXISTS (
    SELECT 1 FROM orders o
    WHERE o.user_id = ci.user_id
      AND o.created_at > ci.created_at
      AND o.status IN ('completed', 'shipped', 'delivered')
      AND o.created_at < NOW() - INTERVAL '7 days' -- Keep for 7 days
  );
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- SUCCESS MESSAGE
-- =============================================
DO $$ 
BEGIN 
  RAISE NOTICE '';
  RAISE NOTICE '✅ ============================================';
  RAISE NOTICE '✅ CART ITEMS AND WISHLIST TABLES CREATED!';
  RAISE NOTICE '✅ ============================================';
  RAISE NOTICE '';
  RAISE NOTICE '📊 Tables Created:';
  RAISE NOTICE '   • cart_items (for abandoned cart tracking)';
  RAISE NOTICE '   • wishlist (for wishlist analytics)';
  RAISE NOTICE '';
  RAISE NOTICE '🔒 Security:';
  RAISE NOTICE '   • Row Level Security (RLS) enabled';
  RAISE NOTICE '   • Users can only access their own data';
  RAISE NOTICE '   • Admins can view all data';
  RAISE NOTICE '';
  RAISE NOTICE '⚡ Performance:';
  RAISE NOTICE '   • Indexes created for fast queries';
  RAISE NOTICE '   • Auto-update triggers for timestamps';
  RAISE NOTICE '';
  RAISE NOTICE '📈 Views Created:';
  RAISE NOTICE '   • abandoned_carts_12h (carts idle >12 hours)';
  RAISE NOTICE '   • wishlist_analytics (wishlist insights)';
  RAISE NOTICE '';
  RAISE NOTICE '🎯 Abandoned Cart Threshold: 12 HOURS';
  RAISE NOTICE '';
  RAISE NOTICE '✅ Ready to use!';
  RAISE NOTICE '';
END $$;

