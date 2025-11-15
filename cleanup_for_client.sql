-- ============================================
-- CLEANUP SCRIPT: Remove all test/demo data
-- Run this BEFORE handing off to client
-- ============================================
-- 
-- WARNING: This will delete ALL transactional and demo data!
-- Make sure to backup if needed before running.
--

-- Disable triggers temporarily to speed up deletion
SET session_replication_role = replica;

-- Clear transactional/demo data (keeps table structure intact)
TRUNCATE TABLE public.order_items CASCADE;
TRUNCATE TABLE public.orders CASCADE;
TRUNCATE TABLE public.cart_items CASCADE;
TRUNCATE TABLE public.carts CASCADE;
TRUNCATE TABLE public.reviews CASCADE;
TRUNCATE TABLE public.wishlists CASCADE;
TRUNCATE TABLE public.user_addresses CASCADE;
TRUNCATE TABLE public.notifications CASCADE;
TRUNCATE TABLE public.coupons CASCADE;
TRUNCATE TABLE public.deals CASCADE;
TRUNCATE TABLE public.deal_products CASCADE;
TRUNCATE TABLE public.payment_transactions CASCADE;
TRUNCATE TABLE public.refunds CASCADE;

-- Clear product data (if you want client to add their own products)
TRUNCATE TABLE public.product_images CASCADE;
TRUNCATE TABLE public.product_attribute_mappings CASCADE;
TRUNCATE TABLE public.products CASCADE;

-- Clear attributes and options (optional - keep if client will use same attributes)
-- TRUNCATE TABLE public.product_attributes CASCADE;
-- TRUNCATE TABLE public.product_attribute_options CASCADE;

-- Clear content (banners, ads, promotions)
TRUNCATE TABLE public.banners CASCADE;
TRUNCATE TABLE public.sidebar_ads CASCADE;
TRUNCATE TABLE public.promotions CASCADE;

-- Clear categories and brands (if you want client to define their own)
-- Comment out these lines if you want to keep the category/brand structure
TRUNCATE TABLE public.categories CASCADE;
TRUNCATE TABLE public.brands CASCADE;

-- Clear test users ONLY (KEEP admin users!)
-- BE VERY CAREFUL: Only delete test users, not real admin accounts!
-- Adjust the WHERE clause to match your test user patterns
DELETE FROM public.users 
WHERE email LIKE '%test%' 
   OR email LIKE '%demo%'
   OR email LIKE '%example%'
   OR email LIKE '%@mailinator.com'
   OR email LIKE '%@temp%';

-- Clear contact form submissions (if any)
TRUNCATE TABLE public.contact_submissions CASCADE;

-- Clear newsletter subscriptions (if demo data exists)
TRUNCATE TABLE public.newsletter_subscribers CASCADE;

-- Re-enable triggers
SET session_replication_role = DEFAULT;

-- Verify cleanup
SELECT 
    'brands' as table_name, 
    COUNT(*) as remaining_records 
FROM public.brands
UNION ALL
SELECT 'categories', COUNT(*) FROM public.categories
UNION ALL
SELECT 'products', COUNT(*) FROM public.products
UNION ALL
SELECT 'orders', COUNT(*) FROM public.orders
UNION ALL
SELECT 'users', COUNT(*) FROM public.users
UNION ALL
SELECT 'reviews', COUNT(*) FROM public.reviews
UNION ALL
SELECT 'banners', COUNT(*) FROM public.banners;

-- ============================================
-- NEXT STEP: Run seed_production.sql
-- This will add essential operational data:
-- - Delivery options
-- - Payment methods
-- - Store settings
-- ============================================

