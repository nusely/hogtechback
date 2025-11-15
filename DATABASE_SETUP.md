# Database Setup Guide

## Issues Found

1. **Notifications Table**: Missing `is_read`, `read_at`, and `action_url` columns
2. **Cart Items Table**: Missing foreign key relationships to `users` and `products` tables
3. **Customers Table**: Missing foreign key relationship to `users` table (`customers_user_id_fkey`)
4. **Orders Table**: Missing foreign key relationships to `users` and `customers` tables (`orders_user_id_fkey`, `orders_customer_id_fkey`)
5. **Transactions Table**: Missing `payment_status` column and foreign key relationships to `orders` and `users` tables (`transactions_order_id_fkey`, `transactions_user_id_fkey`)
6. **Wishlists Table**: Missing foreign key relationships to `users` and `products` tables (`wishlists_user_id_fkey`, `wishlists_product_id_fkey`)
7. **Deal Products Table**: Missing foreign key relationships to `deals` and `products` tables (`deal_products_deal_id_fkey`, `deal_products_product_id_fkey`)
8. **Deals Table**: Missing `display_order` column
9. **Settings Table**: Missing unique constraint on `key` column (required for upsert operations)
10. **Delivery Options Table**: Missing `display_order` and `type` columns

## Quick Fix

### Step 1: Run Migration in Supabase

1. Go to your Supabase Dashboard: https://supabase.com/dashboard
2. Select your project
3. Go to **SQL Editor**
4. Click **New Query**
5. Copy and paste the entire contents of `migrations/fix_database_schema.sql`
6. Click **Run** (or press Ctrl+Enter)

### Step 2: Verify Connection

Run the database connection check:

```bash
npm run check-db
```

This will verify:
- ✅ Notifications table has all required columns
- ✅ Cart items table has proper foreign keys
- ✅ Customers table has proper foreign keys
- ✅ All tables are accessible
- ✅ Complex queries work correctly

## What the Migration Does

### Notifications Table Fixes:
- Adds `is_read` column (boolean, default false)
- Adds `read_at` column (timestamp)
- Adds `action_url` column (varchar 500)
- Updates type constraint to include all valid types

### Cart Items Table Fixes:
- Adds foreign key `cart_items_user_id_fkey` → `users(id)`
- Adds foreign key `cart_items_product_id_fkey` → `products(id)`
- Creates indexes for better query performance

### Customers Table Fixes:
- Adds foreign key `customers_user_id_fkey` → `users(id)` (ON DELETE SET NULL)
- Adds foreign key `customers_created_by_fkey` → `users(id)` (ON DELETE SET NULL)
- Creates indexes for better query performance

### Orders Table Fixes:
- Adds foreign key `orders_user_id_fkey` → `users(id)` (ON DELETE SET NULL)
- Adds foreign key `orders_customer_id_fkey` → `customers(id)` (ON DELETE SET NULL)
- Creates indexes for better query performance

### Transactions Table Fixes:
- Adds `payment_status` column if missing (VARCHAR(50), default 'pending')
- Adds constraint for valid payment status values ('pending', 'paid', 'failed', 'refunded')
- Adds foreign key `transactions_order_id_fkey` → `orders(id)` (ON DELETE SET NULL)
- Adds foreign key `transactions_user_id_fkey` → `users(id)` (ON DELETE SET NULL)
- Creates indexes for better query performance

### Wishlists Table Fixes:
- Adds foreign key `wishlists_user_id_fkey` → `users(id)` (ON DELETE CASCADE)
- Adds foreign key `wishlists_product_id_fkey` → `products(id)` (ON DELETE CASCADE)
- Creates indexes for better query performance

### Settings Table Fixes:
- Adds unique constraint `settings_key_key` on `key` column to enable upsert operations

### Deals Table Fixes:
- Adds `display_order` column (integer, default 0) for ordering deals

### Deal Products Table Fixes:
- Adds foreign key `deal_products_deal_id_fkey` → `deals(id)` (ON DELETE CASCADE)
- Adds foreign key `deal_products_product_id_fkey` → `products(id)` (ON DELETE SET NULL)
- Creates indexes for better query performance

### Delivery Options Table Fixes:
- Adds `display_order` column (integer, default 0) for ordering delivery options
- Adds `type` column (varchar(20), default 'delivery') with constraint for 'delivery' or 'pickup'
- Creates indexes for better query performance

## Testing After Migration

After running the migration, test the backend:

1. **Start the backend** (if not already running):
   ```bash
   npm run dev
   ```

2. **Test notifications endpoint**:
   ```bash
   curl http://localhost:5000/api/notifications
   ```

3. **Check admin dashboard** - The errors should be resolved:
   - Notifications should load without 500 errors
   - Abandoned carts should display correctly
   - Customers/users page should load without relationship errors
   - Customer analytics page should load without relationship errors
   - Transactions page should load without relationship errors
   - Wishlist insights page should load without relationship errors
   - Deals page should load without relationship errors

## Troubleshooting

### If migration fails:

1. Check Supabase logs for specific error messages
2. Verify you have the correct permissions (should work with service role)
3. Check if tables exist: `SELECT * FROM information_schema.tables WHERE table_schema = 'public'`

### If foreign keys fail:

- Make sure `users` and `products` tables exist
- Check if there are orphaned records in `cart_items` or `customers` that reference non-existent users
- You may need to clean up orphaned records first:
  ```sql
  -- Check for orphaned cart_items
  SELECT * FROM cart_items WHERE user_id IS NOT NULL AND user_id NOT IN (SELECT id FROM users);
  
  -- Check for orphaned customers
  SELECT * FROM customers WHERE user_id IS NOT NULL AND user_id NOT IN (SELECT id FROM users);
  ```

### If columns already exist:

The migration uses `IF NOT EXISTS` checks, so it's safe to run multiple times. It will skip existing columns/constraints.

