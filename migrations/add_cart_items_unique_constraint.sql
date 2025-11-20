-- Migration: Add unique constraint on cart_items(user_id, product_id)
-- This ensures users can only have one cart item per product
-- Run this migration if the constraint doesn't exist

-- Check if constraint exists, if not create it
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM pg_constraint 
        WHERE conname = 'cart_items_user_id_product_id_key'
    ) THEN
        ALTER TABLE public.cart_items
        ADD CONSTRAINT cart_items_user_id_product_id_key 
        UNIQUE (user_id, product_id);
        
        RAISE NOTICE 'Unique constraint cart_items_user_id_product_id_key created successfully';
    ELSE
        RAISE NOTICE 'Unique constraint cart_items_user_id_product_id_key already exists';
    END IF;
END $$;

-- Verify the constraint exists
SELECT 
    conname as constraint_name,
    contype as constraint_type,
    pg_get_constraintdef(oid) as constraint_definition
FROM pg_constraint
WHERE conname = 'cart_items_user_id_product_id_key';

