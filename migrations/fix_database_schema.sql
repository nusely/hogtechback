-- ============================================================
-- Database Schema Fixes for Hogtech Backend
-- ============================================================
-- Run this entire file in Supabase SQL Editor
-- This fixes missing columns and foreign key relationships
-- ============================================================

-- ============================================================
-- 1. FIX NOTIFICATIONS TABLE
-- ============================================================

-- Add is_read column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'notifications' 
        AND column_name = 'is_read'
    ) THEN
        ALTER TABLE public.notifications ADD COLUMN is_read boolean DEFAULT false NOT NULL;
        COMMENT ON COLUMN public.notifications.is_read IS 'Whether the notification has been read';
        RAISE NOTICE 'Added is_read column to notifications table';
    ELSE
        RAISE NOTICE 'Column is_read already exists in notifications table';
    END IF;
END $$;

-- Add read_at column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'notifications' 
        AND column_name = 'read_at'
    ) THEN
        ALTER TABLE public.notifications ADD COLUMN read_at timestamptz;
        COMMENT ON COLUMN public.notifications.read_at IS 'Timestamp when the notification was marked as read';
        RAISE NOTICE 'Added read_at column to notifications table';
    ELSE
        RAISE NOTICE 'Column read_at already exists in notifications table';
    END IF;
END $$;

-- Add action_url column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'notifications' 
        AND column_name = 'action_url'
    ) THEN
        ALTER TABLE public.notifications ADD COLUMN action_url varchar(500);
        COMMENT ON COLUMN public.notifications.action_url IS 'Optional URL to navigate to when notification is clicked';
        RAISE NOTICE 'Added action_url column to notifications table';
    ELSE
        RAISE NOTICE 'Column action_url already exists in notifications table';
    END IF;
END $$;

-- Ensure type column has proper constraint
DO $$ 
BEGIN
    -- Drop existing constraint if it exists
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_schema = 'public' 
        AND table_name = 'notifications' 
        AND constraint_name = 'notifications_type_check'
    ) THEN
        ALTER TABLE public.notifications DROP CONSTRAINT notifications_type_check;
    END IF;
    
    -- Add constraint for valid notification types
    ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check 
        CHECK (type IN ('order', 'stock', 'user', 'alert', 'success', 'payment', 'review', 'general'));
    
    RAISE NOTICE 'Updated notifications_type_check constraint';
END $$;

-- ============================================================
-- 2. FIX CUSTOMERS FOREIGN KEYS
-- ============================================================

-- Add foreign key to users table if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_schema = 'public' 
        AND table_name = 'customers' 
        AND constraint_name = 'customers_user_id_fkey'
    ) THEN
        -- Add foreign key constraint
        ALTER TABLE public.customers 
        ADD CONSTRAINT customers_user_id_fkey 
        FOREIGN KEY (user_id) 
        REFERENCES public.users(id) 
        ON DELETE SET NULL;
        
        COMMENT ON CONSTRAINT customers_user_id_fkey ON public.customers IS 
        'Foreign key relationship to users table for proper joins';
        
        RAISE NOTICE 'Added foreign key customers_user_id_fkey';
    ELSE
        RAISE NOTICE 'Foreign key customers_user_id_fkey already exists';
    END IF;
END $$;

-- Add foreign key for created_by if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_schema = 'public' 
        AND table_name = 'customers' 
        AND constraint_name = 'customers_created_by_fkey'
    ) THEN
        -- Add foreign key constraint
        ALTER TABLE public.customers 
        ADD CONSTRAINT customers_created_by_fkey 
        FOREIGN KEY (created_by) 
        REFERENCES public.users(id) 
        ON DELETE SET NULL;
        
        COMMENT ON CONSTRAINT customers_created_by_fkey ON public.customers IS 
        'Foreign key relationship to users table for tracking who created the customer record';
        
        RAISE NOTICE 'Added foreign key customers_created_by_fkey';
    ELSE
        RAISE NOTICE 'Foreign key customers_created_by_fkey already exists';
    END IF;
END $$;

-- ============================================================
-- 3. FIX ORDERS FOREIGN KEYS
-- ============================================================

-- Add foreign key to users table if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_schema = 'public' 
        AND table_name = 'orders' 
        AND constraint_name = 'orders_user_id_fkey'
    ) THEN
        -- Add foreign key constraint
        ALTER TABLE public.orders 
        ADD CONSTRAINT orders_user_id_fkey 
        FOREIGN KEY (user_id) 
        REFERENCES public.users(id) 
        ON DELETE SET NULL;
        
        COMMENT ON CONSTRAINT orders_user_id_fkey ON public.orders IS 
        'Foreign key relationship to users table for proper joins';
        
        RAISE NOTICE 'Added foreign key orders_user_id_fkey';
    ELSE
        RAISE NOTICE 'Foreign key orders_user_id_fkey already exists';
    END IF;
END $$;

-- Add foreign key to customers table if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_schema = 'public' 
        AND table_name = 'orders' 
        AND constraint_name = 'orders_customer_id_fkey'
    ) THEN
        -- Add foreign key constraint
        ALTER TABLE public.orders 
        ADD CONSTRAINT orders_customer_id_fkey 
        FOREIGN KEY (customer_id) 
        REFERENCES public.customers(id) 
        ON DELETE SET NULL;
        
        COMMENT ON CONSTRAINT orders_customer_id_fkey ON public.orders IS 
        'Foreign key relationship to customers table for proper joins';
        
        RAISE NOTICE 'Added foreign key orders_customer_id_fkey';
    ELSE
        RAISE NOTICE 'Foreign key orders_customer_id_fkey already exists';
    END IF;
END $$;

-- ============================================================
-- 4. FIX TRANSACTIONS TABLE
-- ============================================================

-- Add payment_status column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'transactions' 
        AND column_name = 'payment_status'
    ) THEN
        ALTER TABLE public.transactions 
        ADD COLUMN payment_status VARCHAR(50) DEFAULT 'pending';
        
        COMMENT ON COLUMN public.transactions.payment_status IS 'Payment status: pending, paid, failed, or refunded';
        
        RAISE NOTICE 'Added payment_status column to transactions table';
    ELSE
        RAISE NOTICE 'Column payment_status already exists in transactions table';
    END IF;
    
    -- Add constraint if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_schema = 'public' 
        AND table_name = 'transactions' 
        AND constraint_name = 'transactions_payment_status_check'
    ) THEN
        ALTER TABLE public.transactions 
        ADD CONSTRAINT transactions_payment_status_check 
        CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded'));
        
        RAISE NOTICE 'Added transactions_payment_status_check constraint';
    ELSE
        RAISE NOTICE 'Constraint transactions_payment_status_check already exists';
    END IF;
END $$;

-- ============================================================
-- 5. FIX TRANSACTIONS FOREIGN KEYS
-- ============================================================

-- Add foreign key to orders table if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_schema = 'public' 
        AND table_name = 'transactions' 
        AND constraint_name = 'transactions_order_id_fkey'
    ) THEN
        -- Add foreign key constraint
        ALTER TABLE public.transactions 
        ADD CONSTRAINT transactions_order_id_fkey 
        FOREIGN KEY (order_id) 
        REFERENCES public.orders(id) 
        ON DELETE SET NULL;
        
        COMMENT ON CONSTRAINT transactions_order_id_fkey ON public.transactions IS 
        'Foreign key relationship to orders table for proper joins';
        
        RAISE NOTICE 'Added foreign key transactions_order_id_fkey';
    ELSE
        RAISE NOTICE 'Foreign key transactions_order_id_fkey already exists';
    END IF;
END $$;

-- Add foreign key to users table if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_schema = 'public' 
        AND table_name = 'transactions' 
        AND constraint_name = 'transactions_user_id_fkey'
    ) THEN
        -- Add foreign key constraint
        ALTER TABLE public.transactions 
        ADD CONSTRAINT transactions_user_id_fkey 
        FOREIGN KEY (user_id) 
        REFERENCES public.users(id) 
        ON DELETE SET NULL;
        
        COMMENT ON CONSTRAINT transactions_user_id_fkey ON public.transactions IS 
        'Foreign key relationship to users table for proper joins';
        
        RAISE NOTICE 'Added foreign key transactions_user_id_fkey';
    ELSE
        RAISE NOTICE 'Foreign key transactions_user_id_fkey already exists';
    END IF;
END $$;

-- ============================================================
-- 6. FIX WISHLISTS FOREIGN KEYS
-- ============================================================

-- Add foreign key to users table if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_schema = 'public' 
        AND table_name = 'wishlists' 
        AND constraint_name = 'wishlists_user_id_fkey'
    ) THEN
        -- Add foreign key constraint
        ALTER TABLE public.wishlists 
        ADD CONSTRAINT wishlists_user_id_fkey 
        FOREIGN KEY (user_id) 
        REFERENCES public.users(id) 
        ON DELETE CASCADE;
        
        COMMENT ON CONSTRAINT wishlists_user_id_fkey ON public.wishlists IS 
        'Foreign key relationship to users table for proper joins';
        
        RAISE NOTICE 'Added foreign key wishlists_user_id_fkey';
    ELSE
        RAISE NOTICE 'Foreign key wishlists_user_id_fkey already exists';
    END IF;
END $$;

-- Add foreign key to products table if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_schema = 'public' 
        AND table_name = 'wishlists' 
        AND constraint_name = 'wishlists_product_id_fkey'
    ) THEN
        -- Add foreign key constraint
        ALTER TABLE public.wishlists 
        ADD CONSTRAINT wishlists_product_id_fkey 
        FOREIGN KEY (product_id) 
        REFERENCES public.products(id) 
        ON DELETE CASCADE;
        
        COMMENT ON CONSTRAINT wishlists_product_id_fkey ON public.wishlists IS 
        'Foreign key relationship to products table for proper joins';
        
        RAISE NOTICE 'Added foreign key wishlists_product_id_fkey';
    ELSE
        RAISE NOTICE 'Foreign key wishlists_product_id_fkey already exists';
    END IF;
END $$;

-- ============================================================
-- 7. FIX SETTINGS TABLE CONSTRAINTS
-- ============================================================

-- Add unique constraint on settings.key if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_schema = 'public' 
        AND table_name = 'settings' 
        AND constraint_name = 'settings_key_key'
    ) THEN
        -- Add unique constraint
        ALTER TABLE public.settings 
        ADD CONSTRAINT settings_key_key UNIQUE (key);
        
        COMMENT ON CONSTRAINT settings_key_key ON public.settings IS 
        'Unique constraint on key column to enable upsert operations';
        
        RAISE NOTICE 'Added unique constraint settings_key_key';
    ELSE
        RAISE NOTICE 'Unique constraint settings_key_key already exists';
    END IF;
END $$;

-- ============================================================
-- 8. FIX DELIVERY_OPTIONS TABLE COLUMNS
-- ============================================================

-- Add display_order column to delivery_options table if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'delivery_options' 
        AND column_name = 'display_order'
    ) THEN
        ALTER TABLE public.delivery_options ADD COLUMN display_order integer DEFAULT 0 NOT NULL;
        COMMENT ON COLUMN public.delivery_options.display_order IS 'Order for displaying delivery options (lower numbers appear first)';
        RAISE NOTICE 'Added display_order column to delivery_options table';
    ELSE
        RAISE NOTICE 'Column display_order already exists in delivery_options table';
    END IF;
END $$;

-- Add type column to delivery_options table if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'delivery_options' 
        AND column_name = 'type'
    ) THEN
        ALTER TABLE public.delivery_options ADD COLUMN type varchar(20) DEFAULT 'delivery' NOT NULL;
        COMMENT ON COLUMN public.delivery_options.type IS 'Type of delivery option: delivery or pickup';
        RAISE NOTICE 'Added type column to delivery_options table';
        
        -- Add constraint if it doesn't exist
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.table_constraints 
            WHERE constraint_schema = 'public' 
            AND table_name = 'delivery_options' 
            AND constraint_name = 'delivery_options_type_check'
        ) THEN
            ALTER TABLE public.delivery_options ADD CONSTRAINT delivery_options_type_check 
                CHECK (type IN ('delivery', 'pickup'));
            RAISE NOTICE 'Added delivery_options_type_check constraint';
        END IF;
    ELSE
        RAISE NOTICE 'Column type already exists in delivery_options table';
    END IF;
END $$;

-- ============================================================
-- 9. FIX DEALS TABLE COLUMNS
-- ============================================================

-- Add display_order column to deals table if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'deals' 
        AND column_name = 'display_order'
    ) THEN
        ALTER TABLE public.deals ADD COLUMN display_order integer DEFAULT 0 NOT NULL;
        COMMENT ON COLUMN public.deals.display_order IS 'Order for displaying deals (lower numbers appear first)';
        RAISE NOTICE 'Added display_order column to deals table';
    ELSE
        RAISE NOTICE 'Column display_order already exists in deals table';
    END IF;
END $$;

-- ============================================================
-- 10. FIX DEAL_PRODUCTS FOREIGN KEYS
-- ============================================================

-- Add foreign key to deals table if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_schema = 'public' 
        AND table_name = 'deal_products' 
        AND constraint_name = 'deal_products_deal_id_fkey'
    ) THEN
        -- Add foreign key constraint
        ALTER TABLE public.deal_products 
        ADD CONSTRAINT deal_products_deal_id_fkey 
        FOREIGN KEY (deal_id) 
        REFERENCES public.deals(id) 
        ON DELETE CASCADE;
        
        COMMENT ON CONSTRAINT deal_products_deal_id_fkey ON public.deal_products IS 
        'Foreign key relationship to deals table for proper joins';
        
        RAISE NOTICE 'Added foreign key deal_products_deal_id_fkey';
    ELSE
        RAISE NOTICE 'Foreign key deal_products_deal_id_fkey already exists';
    END IF;
END $$;

-- Add foreign key to products table if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_schema = 'public' 
        AND table_name = 'deal_products' 
        AND constraint_name = 'deal_products_product_id_fkey'
    ) THEN
        -- Add foreign key constraint
        ALTER TABLE public.deal_products 
        ADD CONSTRAINT deal_products_product_id_fkey 
        FOREIGN KEY (product_id) 
        REFERENCES public.products(id) 
        ON DELETE SET NULL;
        
        COMMENT ON CONSTRAINT deal_products_product_id_fkey ON public.deal_products IS 
        'Foreign key relationship to products table for proper joins';
        
        RAISE NOTICE 'Added foreign key deal_products_product_id_fkey';
    ELSE
        RAISE NOTICE 'Foreign key deal_products_product_id_fkey already exists';
    END IF;
END $$;

-- ============================================================
-- 11. FIX CART_ITEMS FOREIGN KEYS
-- ============================================================

-- Add foreign key to users table if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_schema = 'public' 
        AND table_name = 'cart_items' 
        AND constraint_name = 'cart_items_user_id_fkey'
    ) THEN
        -- Add foreign key constraint
        ALTER TABLE public.cart_items 
        ADD CONSTRAINT cart_items_user_id_fkey 
        FOREIGN KEY (user_id) 
        REFERENCES public.users(id) 
        ON DELETE CASCADE;
        
        COMMENT ON CONSTRAINT cart_items_user_id_fkey ON public.cart_items IS 
        'Foreign key relationship to users table for proper joins';
        
        RAISE NOTICE 'Added foreign key cart_items_user_id_fkey';
    ELSE
        RAISE NOTICE 'Foreign key cart_items_user_id_fkey already exists';
    END IF;
END $$;

-- Add foreign key to products table if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_schema = 'public' 
        AND table_name = 'cart_items' 
        AND constraint_name = 'cart_items_product_id_fkey'
    ) THEN
        -- Add foreign key constraint
        ALTER TABLE public.cart_items 
        ADD CONSTRAINT cart_items_product_id_fkey 
        FOREIGN KEY (product_id) 
        REFERENCES public.products(id) 
        ON DELETE CASCADE;
        
        COMMENT ON CONSTRAINT cart_items_product_id_fkey ON public.cart_items IS 
        'Foreign key relationship to products table for proper joins';
        
        RAISE NOTICE 'Added foreign key cart_items_product_id_fkey';
    ELSE
        RAISE NOTICE 'Foreign key cart_items_product_id_fkey already exists';
    END IF;
END $$;

-- ============================================================
-- 12. CREATE INDEXES FOR BETTER PERFORMANCE
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_cart_items_user_id ON public.cart_items(user_id);
CREATE INDEX IF NOT EXISTS idx_cart_items_product_id ON public.cart_items(product_id);
CREATE INDEX IF NOT EXISTS idx_cart_items_updated_at ON public.cart_items(updated_at);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON public.notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON public.notifications(created_at);
CREATE INDEX IF NOT EXISTS idx_customers_user_id ON public.customers(user_id);
CREATE INDEX IF NOT EXISTS idx_customers_email ON public.customers(email);
CREATE INDEX IF NOT EXISTS idx_customers_created_at ON public.customers(created_at);
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON public.orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON public.orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON public.orders(payment_status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders(created_at);
CREATE INDEX IF NOT EXISTS idx_transactions_order_id ON public.transactions(order_id);
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON public.transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_payment_status ON public.transactions(payment_status);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON public.transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_wishlists_user_id ON public.wishlists(user_id);
CREATE INDEX IF NOT EXISTS idx_wishlists_product_id ON public.wishlists(product_id);
CREATE INDEX IF NOT EXISTS idx_wishlists_created_at ON public.wishlists(created_at);
CREATE INDEX IF NOT EXISTS idx_deal_products_deal_id ON public.deal_products(deal_id);
CREATE INDEX IF NOT EXISTS idx_deal_products_product_id ON public.deal_products(product_id);
CREATE INDEX IF NOT EXISTS idx_deal_products_sort_order ON public.deal_products(deal_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_deals_display_order ON public.deals(display_order);
CREATE INDEX IF NOT EXISTS idx_delivery_options_display_order ON public.delivery_options(display_order);

-- ============================================================
-- 13. VERIFY CHANGES
-- ============================================================

DO $$
DECLARE
    has_is_read boolean;
    has_read_at boolean;
    has_action_url boolean;
    has_user_fk boolean;
    has_product_fk boolean;
    has_customers_user_fk boolean;
    has_orders_user_fk boolean;
    has_orders_customer_fk boolean;
    has_transactions_payment_status boolean;
    has_transactions_order_fk boolean;
    has_transactions_user_fk boolean;
    has_wishlists_user_fk boolean;
    has_wishlists_product_fk boolean;
    has_deal_products_deal_fk boolean;
    has_deal_products_product_fk boolean;
    has_deals_display_order boolean;
    has_settings_key_unique boolean;
    has_delivery_options_display_order boolean;
    has_delivery_options_type boolean;
BEGIN
    -- Check notifications columns
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'notifications' 
        AND column_name = 'is_read'
    ) INTO has_is_read;
    
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'notifications' 
        AND column_name = 'read_at'
    ) INTO has_read_at;
    
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'notifications' 
        AND column_name = 'action_url'
    ) INTO has_action_url;
    
    -- Check foreign keys
    SELECT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_schema = 'public' 
        AND table_name = 'cart_items' 
        AND constraint_name = 'cart_items_user_id_fkey'
    ) INTO has_user_fk;
    
    SELECT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_schema = 'public' 
        AND table_name = 'cart_items' 
        AND constraint_name = 'cart_items_product_id_fkey'
    ) INTO has_product_fk;
    
    -- Check customers foreign keys
    SELECT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_schema = 'public' 
        AND table_name = 'customers' 
        AND constraint_name = 'customers_user_id_fkey'
    ) INTO has_customers_user_fk;
    
    -- Check orders foreign keys
    SELECT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_schema = 'public' 
        AND table_name = 'orders' 
        AND constraint_name = 'orders_user_id_fkey'
    ) INTO has_orders_user_fk;
    
    SELECT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_schema = 'public' 
        AND table_name = 'orders' 
        AND constraint_name = 'orders_customer_id_fkey'
    ) INTO has_orders_customer_fk;
    
    -- Check transactions column
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'transactions' 
        AND column_name = 'payment_status'
    ) INTO has_transactions_payment_status;
    
    -- Check transactions foreign keys
    SELECT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_schema = 'public' 
        AND table_name = 'transactions' 
        AND constraint_name = 'transactions_order_id_fkey'
    ) INTO has_transactions_order_fk;
    
    SELECT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_schema = 'public' 
        AND table_name = 'transactions' 
        AND constraint_name = 'transactions_user_id_fkey'
    ) INTO has_transactions_user_fk;
    
    -- Check wishlists foreign keys
    SELECT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_schema = 'public' 
        AND table_name = 'wishlists' 
        AND constraint_name = 'wishlists_user_id_fkey'
    ) INTO has_wishlists_user_fk;
    
    SELECT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_schema = 'public' 
        AND table_name = 'wishlists' 
        AND constraint_name = 'wishlists_product_id_fkey'
    ) INTO has_wishlists_product_fk;
    
    -- Check deal_products foreign keys
    SELECT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_schema = 'public' 
        AND table_name = 'deal_products' 
        AND constraint_name = 'deal_products_deal_id_fkey'
    ) INTO has_deal_products_deal_fk;
    
    SELECT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_schema = 'public' 
        AND table_name = 'deal_products' 
        AND constraint_name = 'deal_products_product_id_fkey'
    ) INTO has_deal_products_product_fk;
    
    -- Check deals.display_order column
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'deals' 
        AND column_name = 'display_order'
    ) INTO has_deals_display_order;
    
    -- Check settings.key unique constraint
    SELECT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_schema = 'public' 
        AND table_name = 'settings' 
        AND constraint_name = 'settings_key_key'
    ) INTO has_settings_key_unique;
    
    -- Check delivery_options columns
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'delivery_options' 
        AND column_name = 'display_order'
    ) INTO has_delivery_options_display_order;
    
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'delivery_options' 
        AND column_name = 'type'
    ) INTO has_delivery_options_type;
    
    RAISE NOTICE '========================================';
    RAISE NOTICE 'VERIFICATION RESULTS:';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'notifications.is_read: %', CASE WHEN has_is_read THEN '✅ EXISTS' ELSE '❌ MISSING' END;
    RAISE NOTICE 'notifications.read_at: %', CASE WHEN has_read_at THEN '✅ EXISTS' ELSE '❌ MISSING' END;
    RAISE NOTICE 'notifications.action_url: %', CASE WHEN has_action_url THEN '✅ EXISTS' ELSE '❌ MISSING' END;
    RAISE NOTICE 'cart_items_user_id_fkey: %', CASE WHEN has_user_fk THEN '✅ EXISTS' ELSE '❌ MISSING' END;
    RAISE NOTICE 'cart_items_product_id_fkey: %', CASE WHEN has_product_fk THEN '✅ EXISTS' ELSE '❌ MISSING' END;
    RAISE NOTICE 'customers_user_id_fkey: %', CASE WHEN has_customers_user_fk THEN '✅ EXISTS' ELSE '❌ MISSING' END;
    RAISE NOTICE 'orders_user_id_fkey: %', CASE WHEN has_orders_user_fk THEN '✅ EXISTS' ELSE '❌ MISSING' END;
    RAISE NOTICE 'orders_customer_id_fkey: %', CASE WHEN has_orders_customer_fk THEN '✅ EXISTS' ELSE '❌ MISSING' END;
    RAISE NOTICE 'transactions.payment_status: %', CASE WHEN has_transactions_payment_status THEN '✅ EXISTS' ELSE '❌ MISSING' END;
    RAISE NOTICE 'transactions_order_id_fkey: %', CASE WHEN has_transactions_order_fk THEN '✅ EXISTS' ELSE '❌ MISSING' END;
    RAISE NOTICE 'transactions_user_id_fkey: %', CASE WHEN has_transactions_user_fk THEN '✅ EXISTS' ELSE '❌ MISSING' END;
    RAISE NOTICE 'wishlists_user_id_fkey: %', CASE WHEN has_wishlists_user_fk THEN '✅ EXISTS' ELSE '❌ MISSING' END;
    RAISE NOTICE 'wishlists_product_id_fkey: %', CASE WHEN has_wishlists_product_fk THEN '✅ EXISTS' ELSE '❌ MISSING' END;
    RAISE NOTICE 'deal_products_deal_id_fkey: %', CASE WHEN has_deal_products_deal_fk THEN '✅ EXISTS' ELSE '❌ MISSING' END;
    RAISE NOTICE 'deal_products_product_id_fkey: %', CASE WHEN has_deal_products_product_fk THEN '✅ EXISTS' ELSE '❌ MISSING' END;
    RAISE NOTICE 'deals.display_order: %', CASE WHEN has_deals_display_order THEN '✅ EXISTS' ELSE '❌ MISSING' END;
    RAISE NOTICE 'settings_key_key (unique): %', CASE WHEN has_settings_key_unique THEN '✅ EXISTS' ELSE '❌ MISSING' END;
    RAISE NOTICE 'delivery_options.display_order: %', CASE WHEN has_delivery_options_display_order THEN '✅ EXISTS' ELSE '❌ MISSING' END;
    RAISE NOTICE 'delivery_options.type: %', CASE WHEN has_delivery_options_type THEN '✅ EXISTS' ELSE '❌ MISSING' END;
    RAISE NOTICE '========================================';
END $$;

