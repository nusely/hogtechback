-- Migration: Backfill transactions table from existing paid orders
-- This creates transaction records for orders that have payment_status = 'paid' but no corresponding transaction
-- 
-- IMPORTANT: Run add_customer_email_to_transactions.sql first if customer_email column doesn't exist

-- First, ensure all required columns exist (idempotent checks)
DO $$
BEGIN
    -- Add customer_email column if missing
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'transactions'
        AND column_name = 'customer_email'
    ) THEN
        ALTER TABLE public.transactions
        ADD COLUMN customer_email VARCHAR(255) NOT NULL DEFAULT 'no-email@example.com';
        
        ALTER TABLE public.transactions
        ALTER COLUMN customer_email DROP DEFAULT;
        
        CREATE INDEX IF NOT EXISTS idx_transactions_customer_email ON transactions(customer_email);
        
        RAISE NOTICE '✅ Added customer_email column to transactions table';
    END IF;
    
    -- Add initiated_at column if missing
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'transactions'
        AND column_name = 'initiated_at'
    ) THEN
        ALTER TABLE public.transactions
        ADD COLUMN initiated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
        
        CREATE INDEX IF NOT EXISTS idx_transactions_initiated_at ON transactions(initiated_at);
        
        RAISE NOTICE '✅ Added initiated_at column to transactions table';
    END IF;
    
    -- Add paid_at column if missing
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'transactions'
        AND column_name = 'paid_at'
    ) THEN
        ALTER TABLE public.transactions
        ADD COLUMN paid_at TIMESTAMP WITH TIME ZONE;
        
        CREATE INDEX IF NOT EXISTS idx_transactions_paid_at ON transactions(paid_at);
        
        RAISE NOTICE '✅ Added paid_at column to transactions table';
    END IF;
    
    -- Ensure created_at exists (should exist, but check anyway)
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'transactions'
        AND column_name = 'created_at'
    ) THEN
        ALTER TABLE public.transactions
        ADD COLUMN created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
        
        CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at);
        
        RAISE NOTICE '✅ Added created_at column to transactions table';
    END IF;
    
    -- Ensure updated_at exists (should exist, but check anyway)
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'transactions'
        AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE public.transactions
        ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
        
        RAISE NOTICE '✅ Added updated_at column to transactions table';
    END IF;
    
    -- Check and fix foreign key constraint if it's pointing to wrong table
    -- The constraint should reference users table, not customers table
    IF EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_class t ON c.conrelid = t.oid
        JOIN pg_class r ON c.confrelid = r.oid
        WHERE t.relname = 'transactions'
        AND c.conname = 'transactions_user_id_fkey'
        AND r.relname = 'customers'
    ) THEN
        -- Drop the incorrect constraint
        ALTER TABLE public.transactions
        DROP CONSTRAINT IF EXISTS transactions_user_id_fkey;
        
        -- Add correct constraint pointing to users table
        ALTER TABLE public.transactions
        ADD CONSTRAINT transactions_user_id_fkey 
        FOREIGN KEY (user_id) 
        REFERENCES public.users(id) 
        ON DELETE SET NULL;
        
        RAISE NOTICE '✅ Fixed transactions_user_id_fkey to reference users table';
    ELSIF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_class t ON c.conrelid = t.oid
        WHERE t.relname = 'transactions'
        AND c.conname = 'transactions_user_id_fkey'
    ) THEN
        -- Add constraint if it doesn't exist
        ALTER TABLE public.transactions
        ADD CONSTRAINT transactions_user_id_fkey 
        FOREIGN KEY (user_id) 
        REFERENCES public.users(id) 
        ON DELETE SET NULL;
        
        RAISE NOTICE '✅ Added transactions_user_id_fkey constraint';
    END IF;
END $$;

-- Insert transactions for orders that are paid but don't have a transaction
-- Using WHERE NOT EXISTS to avoid duplicates instead of ON CONFLICT
INSERT INTO transactions (
  order_id,
  user_id,
  transaction_reference,
  payment_method,
  payment_provider,
  amount,
  currency,
  status,
  payment_status,
  customer_email,
  metadata,
  initiated_at,
  paid_at,
  created_at,
  updated_at
)
SELECT 
  o.id AS order_id,
  -- Only include user_id if the user exists in the users table
  -- Set to NULL if user doesn't exist (to satisfy foreign key constraint)
  -- Note: The foreign key constraint may incorrectly reference customers table,
  -- so we verify the user exists in users table before including it
  CASE 
    WHEN o.user_id IS NOT NULL THEN
      CASE 
        WHEN EXISTS (SELECT 1 FROM users WHERE id = o.user_id) THEN o.user_id
        ELSE NULL
      END
    ELSE NULL
  END AS user_id,
  -- Generate transaction reference from order number or order ID
  -- Note: payment_reference is stored in shipping_address JSONB, not as a direct column
  COALESCE(
    (SELECT value::text FROM jsonb_each_text(o.shipping_address) WHERE key = 'payment_reference'),
    'TXN-' || SUBSTRING(o.id::text, 1, 8) || '-' || SUBSTRING(o.order_number::text, 1, 8)
  ) AS transaction_reference,
  COALESCE(o.payment_method, 'cash_on_delivery') AS payment_method,
  CASE 
    WHEN o.payment_method = 'paystack' THEN 'paystack'
    WHEN o.payment_method = 'cash_on_delivery' THEN 'cash'
    WHEN o.payment_method = 'mobile_money' THEN 'mobile_money'
    ELSE 'other'
  END AS payment_provider,
  o.total AS amount,
  'GHS' AS currency,
  'success' AS status, -- Paid orders are successful
  'paid' AS payment_status,
  -- Extract customer email from various sources
  COALESCE(
    (SELECT value::text FROM jsonb_each_text(o.shipping_address) WHERE key = 'email'),
    u.email,
    c.email,
    'no-email@example.com'
  ) AS customer_email,
  jsonb_build_object(
    'order_number', o.order_number,
    'customer_name', COALESCE(
      (SELECT value::text FROM jsonb_each_text(o.shipping_address) WHERE key = 'full_name'),
      u.full_name,
      CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, '')),
      c.full_name
    ),
    'subtotal', o.subtotal,
    'discount', COALESCE(o.discount, 0),
    'tax', COALESCE(o.tax, 0),
    'shipping_fee', COALESCE(o.shipping_fee, 0),
    'total', o.total,
    'payment_method', o.payment_method,
    'order_id', o.id,
    'backfilled', true -- Mark as backfilled
  ) AS metadata,
  o.created_at AS initiated_at,
  o.updated_at AS paid_at, -- Use updated_at as paid_at since we don't know exact payment time
  o.created_at AS created_at,
  o.updated_at AS updated_at
FROM orders o
LEFT JOIN users u ON o.user_id = u.id
LEFT JOIN customers c ON o.customer_id = c.id
WHERE 
  o.payment_status = 'paid'
  AND o.total > 0 -- Only orders with a total amount
  -- Only insert if order doesn't already have a transaction
  AND NOT EXISTS (
    SELECT 1 FROM transactions t 
    WHERE t.order_id = o.id
  )
  -- Only insert if transaction_reference doesn't already exist
  AND NOT EXISTS (
    SELECT 1 FROM transactions t 
    WHERE t.transaction_reference = COALESCE(
      (SELECT value::text FROM jsonb_each_text(o.shipping_address) WHERE key = 'payment_reference'),
      'TXN-' || SUBSTRING(o.id::text, 1, 8) || '-' || SUBSTRING(o.order_number::text, 1, 8)
    )
  );

-- Verify the backfill
SELECT 
  COUNT(*) AS backfilled_transactions,
  SUM(amount) AS total_amount
FROM transactions
WHERE metadata->>'backfilled' = 'true';

-- Show summary
SELECT 
  'Total paid orders' AS metric,
  COUNT(*) AS count
FROM orders
WHERE payment_status = 'paid'
UNION ALL
SELECT 
  'Orders with transactions' AS metric,
  COUNT(DISTINCT order_id) AS count
FROM transactions
WHERE order_id IS NOT NULL
UNION ALL
SELECT 
  'Paid orders without transactions' AS metric,
  COUNT(*) AS count
FROM orders o
LEFT JOIN transactions t ON t.order_id = o.id
WHERE o.payment_status = 'paid' AND t.id IS NULL;

