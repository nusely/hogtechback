# Database Seeding Guide for Hogtech E-commerce

## Overview
This guide explains how to seed your database with test data, work with it during development, and clean it up for client delivery.

## Seeding Options

### 1. Development Seed (`seed_dev.sql`)
Use this for local testing and demos. It includes:
- 2 sample brands (Hogtech Electronics, Hogtech Home)
- 3 categories (Smartphones, Laptops, Accessories)
- 2 products with full details (Hogtech Phone X, Hogtech Laptop Pro)
- Product attributes and options (colors, storage variants)
- 1 sample review
- Delivery options (Standard, Express)
- Payment methods (Paystack, Mobile Money)
- Store settings
- 1 promotional banner
- 1 sidebar ad

**How to run:**
1. Go to Supabase SQL Editor: https://hrmxchfwiozifgpmjemf.supabase.co
2. Copy contents from `gadgetsbackend/seed_dev.sql`
3. Paste and click **Run**

### 2. Production Seed (`seed_production.sql`)
Minimal essential data for production (safe for client handoff):
- Delivery options only
- Payment methods only
- Core store settings
- Optional launch promotion

## Testing Workflow

### Step 1: Seed Development Data
```bash
# Run seed_dev.sql in Supabase SQL Editor
```

### Step 2: Test Through the Application
After seeding, test these features:
- **Admin Panel**: Add more brands, categories, products
- **Orders**: Create test orders through the frontend
- **Users**: Sign up test accounts, assign admin roles
- **Reviews**: Add product reviews
- **Deals**: Create flash deals and promotions

### Step 3: Use Backend to Create More Data
You can use the backend API or Supabase Table Editor to add:
- More products
- Customer orders
- Reviews and ratings
- Banners and ads
- Coupons and discounts

### Step 4: Clean Up Before Client Delivery

When you're ready to deliver to the client, run this cleanup script:

```sql
-- ============================================
-- CLEANUP SCRIPT: Remove all test/demo data
-- Run this BEFORE handing off to client
-- ============================================

-- Disable triggers temporarily
SET session_replication_role = replica;

-- Clear transactional/demo data (keeps structure)
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

-- Clear product data (if you want client to add their own)
TRUNCATE TABLE public.product_images CASCADE;
TRUNCATE TABLE public.product_attribute_mappings CASCADE;
TRUNCATE TABLE public.products CASCADE;
TRUNCATE TABLE public.product_attributes CASCADE;
TRUNCATE TABLE public.product_attribute_options CASCADE;

-- Clear content (banners, ads, promotions)
TRUNCATE TABLE public.banners CASCADE;
TRUNCATE TABLE public.sidebar_ads CASCADE;
TRUNCATE TABLE public.promotions CASCADE;

-- Clear categories and brands (if you want client to define their own)
TRUNCATE TABLE public.categories CASCADE;
TRUNCATE TABLE public.brands CASCADE;

-- Clear test users (KEEP admin users if already set up)
-- BE CAREFUL: Only delete test users, not real admin accounts!
DELETE FROM public.users 
WHERE email LIKE '%test%' 
   OR email LIKE '%demo%'
   OR email LIKE '%example%';

-- Re-enable triggers
SET session_replication_role = DEFAULT;

-- Now run seed_production.sql to add essential data
```

## Recommended Workflow

### For Development & Testing (NOW):
1. ✅ Run `fix_rls_policies.sql` first (to fix the RLS issue)
2. ✅ Run `seed_dev.sql` (get sample data)
3. ✅ Test all features through the app
4. ✅ Add more test data via admin panel/backend
5. ✅ Make sure `cimons@hogtechgh.com` is promoted to admin:
   ```bash
   cd gadgetsbackend
   npx ts-node src/scripts/promoteAdmin.ts cimons@hogtechgh.com
   ```

### For Client Delivery (LATER):
1. ⚠️ Run the cleanup script above
2. ⚠️ Run `seed_production.sql` (minimal essential data)
3. ⚠️ Verify one admin account exists for client
4. ⚠️ Update store settings with client's actual info
5. ✅ Deliver clean database

## Important Notes

- **RLS Policies**: Already configured in `hogtech_schema.sql`, but you need to run `fix_rls_policies.sql` to allow user profile creation
- **Admin Access**: Make sure at least one admin user exists before client handoff
- **Store Settings**: Update these in the `settings` table with real business info before delivery
- **Payment Integration**: Configure Paystack keys in production
- **Email**: Verify Resend is set up with proper sender domains

## Quick Commands

### Seed Development Data
```sql
-- Copy and paste seed_dev.sql in Supabase SQL Editor
```

### Check What's in Database
```sql
-- Count records in each table
SELECT 'brands' as table_name, COUNT(*) FROM public.brands
UNION ALL
SELECT 'categories', COUNT(*) FROM public.categories
UNION ALL
SELECT 'products', COUNT(*) FROM public.products
UNION ALL
SELECT 'orders', COUNT(*) FROM public.orders
UNION ALL
SELECT 'users', COUNT(*) FROM public.users;
```

### Promote User to Admin
```bash
cd gadgetsbackend
npx ts-node src/scripts/promoteAdmin.ts user@example.com
```

