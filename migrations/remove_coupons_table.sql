-- Migration: Remove Coupons Table
-- This migration removes the coupons table and all related constraints
-- The coupon system has been completely removed from the application

-- Drop foreign key constraint first (if it exists)
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'coupons_created_by_fkey'
    AND table_name = 'coupons'
  ) THEN
    ALTER TABLE public.coupons DROP CONSTRAINT IF EXISTS coupons_created_by_fkey;
    RAISE NOTICE 'Dropped foreign key constraint: coupons_created_by_fkey';
  END IF;
END $$;

-- Drop any indexes on coupons table
DROP INDEX IF EXISTS idx_coupons_code;
DROP INDEX IF EXISTS idx_coupons_is_active;
DROP INDEX IF EXISTS idx_coupons_valid_dates;

-- Drop the coupons table
DROP TABLE IF EXISTS public.coupons CASCADE;

-- Note: The discount_code column in orders table is kept for backward compatibility
-- but will always be set to null. No need to drop it as it doesn't cause issues.

