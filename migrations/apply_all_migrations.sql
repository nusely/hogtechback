-- Apply all migrations for fixing database schema
-- Run this in Supabase SQL Editor

-- 1. Fix notifications table
\i migrations/fix_notifications_table.sql

-- 2. Fix cart_items foreign keys
\i migrations/fix_cart_items_foreign_keys.sql

-- Note: Supabase SQL Editor doesn't support \i directive
-- Please copy and paste each migration file's content separately

