-- Migration: Add customer_email column to transactions table if it doesn't exist
-- This migration is idempotent - safe to run multiple times

DO $$
BEGIN
    -- Check if customer_email column exists
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'transactions'
        AND column_name = 'customer_email'
    ) THEN
        -- Add customer_email column
        ALTER TABLE public.transactions
        ADD COLUMN customer_email VARCHAR(255) NOT NULL DEFAULT 'no-email@example.com';
        
        -- Remove the default after adding (so future inserts require explicit values)
        ALTER TABLE public.transactions
        ALTER COLUMN customer_email DROP DEFAULT;
        
        -- Create index for better query performance
        CREATE INDEX IF NOT EXISTS idx_transactions_customer_email ON transactions(customer_email);
        
        RAISE NOTICE '✅ Added customer_email column to transactions table';
    ELSE
        RAISE NOTICE '✅ customer_email column already exists in transactions table';
    END IF;
END $$;

-- Verify column exists
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name = 'transactions'
AND column_name = 'customer_email';

