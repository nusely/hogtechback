-- Migration: Add deal_product_id and deal_snapshot columns to order_items table
-- This migration is idempotent - safe to run multiple times

-- Add deal_product_id column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'order_items' 
        AND column_name = 'deal_product_id'
    ) THEN
        ALTER TABLE public.order_items
        ADD COLUMN deal_product_id UUID;
        
        -- Add foreign key constraint if deal_products table exists
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'deal_products') THEN
            ALTER TABLE public.order_items
            ADD CONSTRAINT order_items_deal_product_id_fkey 
            FOREIGN KEY (deal_product_id) REFERENCES public.deal_products(id);
        END IF;
        
        RAISE NOTICE '✅ Added deal_product_id column to order_items';
    ELSE
        RAISE NOTICE '✅ deal_product_id column already exists in order_items';
    END IF;
END $$;

-- Add deal_snapshot column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'order_items' 
        AND column_name = 'deal_snapshot'
    ) THEN
        ALTER TABLE public.order_items
        ADD COLUMN deal_snapshot JSONB;
        
        RAISE NOTICE '✅ Added deal_snapshot column to order_items';
    ELSE
        RAISE NOTICE '✅ deal_snapshot column already exists in order_items';
    END IF;
END $$;

-- Verify columns exist
SELECT 
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' 
AND table_name = 'order_items'
AND column_name IN ('deal_product_id', 'deal_snapshot')
ORDER BY column_name;

