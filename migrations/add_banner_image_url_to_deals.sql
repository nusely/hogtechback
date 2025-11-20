-- Migration: Ensure banner_image_url column exists in deals table
-- This migration is idempotent - safe to run multiple times

DO $$
BEGIN
    -- Check if banner_image_url column exists
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'deals'
        AND column_name = 'banner_image_url'
    ) THEN
        -- Add banner_image_url column
        ALTER TABLE public.deals
        ADD COLUMN banner_image_url TEXT;
        
        RAISE NOTICE '✅ Added banner_image_url column to deals table';
    ELSE
        RAISE NOTICE '✅ banner_image_url column already exists in deals table';
    END IF;
END $$;

-- Verify column exists
SELECT 
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name = 'deals'
AND column_name = 'banner_image_url';

-- Note: After running this migration, Supabase may need a few minutes to refresh its schema cache
-- If the error persists, try:
-- 1. Wait 2-3 minutes for Supabase to refresh the cache
-- 2. Or manually refresh the schema cache in Supabase Dashboard > API > Schema Cache > Refresh

