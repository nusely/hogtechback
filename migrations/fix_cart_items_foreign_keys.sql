-- Fix cart_items foreign key relationships
-- This ensures proper joins between cart_items, users, and products

-- Add foreign key to users table if it doesn't exist
DO $$ 
BEGIN
    -- Check if foreign key already exists
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
    END IF;
END $$;

-- Add foreign key to products table if it doesn't exist
DO $$ 
BEGIN
    -- Check if foreign key already exists
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
    END IF;
END $$;

-- Create index on user_id for better query performance
CREATE INDEX IF NOT EXISTS idx_cart_items_user_id ON public.cart_items(user_id);
CREATE INDEX IF NOT EXISTS idx_cart_items_product_id ON public.cart_items(product_id);
CREATE INDEX IF NOT EXISTS idx_cart_items_updated_at ON public.cart_items(updated_at);

