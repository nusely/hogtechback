-- Verify order_items table columns
-- Run this in Supabase SQL Editor to check what columns exist

SELECT 
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' 
AND table_name = 'order_items'
ORDER BY ordinal_position;

-- If product_image column exists, refresh the schema cache with:
-- NOTIFY pgrst, 'reload schema';

