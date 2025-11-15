// Load environment variables FIRST before any other imports
import dotenv from 'dotenv';
dotenv.config();

import { supabaseAdmin } from '../utils/supabaseClient';

async function checkDatabaseConnection() {
  console.log('🔍 Checking database connection...\n');

  try {
    // Test 1: Check notifications table
    console.log('1️⃣  Testing notifications table...');
    const { data: notifications, error: notifError } = await supabaseAdmin
      .from('notifications')
      .select('id, type, title, message, is_read, created_at, action_url, read_at')
      .limit(1);

    if (notifError) {
      console.error('   ❌ Error:', notifError.message);
      if (notifError.message.includes('read_at')) {
        console.log('   💡 The `read_at` column is missing. Run the migration SQL.');
      }
    } else {
      console.log('   ✅ Notifications table accessible');
      if (notifications && notifications.length > 0) {
        const hasReadAt = 'read_at' in notifications[0];
        console.log(`   ${hasReadAt ? '✅' : '⚠️ '} Column 'read_at' ${hasReadAt ? 'exists' : 'missing'}`);
      } else {
        console.log('   ⚠️  Table is empty, cannot verify column existence');
      }
    }

    // Test 2: Check cart_items table
    console.log('\n2️⃣  Testing cart_items table...');
    const { data: cartItems, error: cartError } = await supabaseAdmin
      .from('cart_items')
      .select('id, user_id, product_id, quantity')
      .limit(1);

    if (cartError) {
      console.error('   ❌ Error:', cartError.message);
    } else {
      console.log('   ✅ Cart items table accessible');
    }

    // Test 3: Check products table (for joins)
    console.log('\n3️⃣  Testing products table...');
    const { data: products, error: productsError } = await supabaseAdmin
      .from('products')
      .select('id, name')
      .limit(1);

    if (productsError) {
      console.error('   ❌ Error:', productsError.message);
    } else {
      console.log('   ✅ Products table accessible');
    }

    // Test 4: Check users table (for joins)
    console.log('\n4️⃣  Testing users table...');
    const { data: users, error: usersError } = await supabaseAdmin
      .from('users')
      .select('id, email')
      .limit(1);

    if (usersError) {
      console.error('   ❌ Error:', usersError.message);
    } else {
      console.log('   ✅ Users table accessible');
    }

    // Test 5: Test complex query (like abandoned carts)
    console.log('\n5️⃣  Testing complex query (cart_items with joins)...');
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: abandonedCarts, error: abandonedError } = await supabaseAdmin
      .from('cart_items')
      .select(`
        id,
        user_id,
        quantity,
        product:products(id),
        user:users!cart_items_user_id_fkey(id, email)
      `)
      .lt('updated_at', twentyFourHoursAgo)
      .limit(1);

    if (abandonedError) {
      console.error('   ❌ Error:', abandonedError.message);
      console.log('   💡 This might be an RLS policy issue or missing foreign key');
    } else {
      console.log('   ✅ Complex query works');
    }

    // Test 6: Test customers table with user relationship
    console.log('\n6️⃣  Testing customers table with user join...');
    const { data: customers, error: customersError } = await supabaseAdmin
      .from('customers')
      .select(`
        id,
        user_id,
        full_name,
        email,
        user:users!customers_user_id_fkey(
          id,
          full_name,
          email
        )
      `)
      .limit(1);

    if (customersError) {
      console.error('   ❌ Error:', customersError.message);
      console.log('   💡 The customers_user_id_fkey foreign key is missing. Run the migration SQL.');
    } else {
      console.log('   ✅ Customers table with user join works');
    }

    // Test 7: Test orders table with customer and user relationships
    console.log('\n7️⃣  Testing orders table with customer and user joins...');
    const { data: orders, error: ordersError } = await supabaseAdmin
      .from('orders')
      .select(`
        id,
        total,
        customer_id,
        user_id,
        customer:customers!orders_customer_id_fkey(id, full_name, email),
        user:users!orders_user_id_fkey(id, full_name, email)
      `)
      .limit(1);

    if (ordersError) {
      console.error('   ❌ Error:', ordersError.message);
      console.log('   💡 The orders foreign keys (orders_user_id_fkey or orders_customer_id_fkey) are missing. Run the migration SQL.');
    } else {
      console.log('   ✅ Orders table with customer and user joins works');
    }

    // Test 8: Test transactions table with order and user relationships
    console.log('\n8️⃣  Testing transactions table with order and user joins...');
    const { data: transactions, error: transactionsError } = await supabaseAdmin
      .from('transactions')
      .select(`
        id,
        amount,
        order_id,
        user_id,
        order:orders!transactions_order_id_fkey(id, order_number, payment_status),
        user:users!transactions_user_id_fkey(id, email)
      `)
      .limit(1);

    if (transactionsError) {
      console.error('   ❌ Error:', transactionsError.message);
      console.log('   💡 The transactions foreign keys (transactions_order_id_fkey or transactions_user_id_fkey) are missing. Run the migration SQL.');
    } else {
      console.log('   ✅ Transactions table with order and user joins works');
    }

    // Test 9: Test wishlists table with user and product relationships
    console.log('\n9️⃣  Testing wishlists table with user and product joins...');
    const { data: wishlists, error: wishlistsError } = await supabaseAdmin
      .from('wishlists')
      .select(`
        id,
        user_id,
        product_id,
        user:users!wishlists_user_id_fkey(id, email, full_name),
        product:products!wishlists_product_id_fkey(id, name)
      `)
      .limit(1);

    if (wishlistsError) {
      console.error('   ❌ Error:', wishlistsError.message);
      console.log('   💡 The wishlists foreign keys (wishlists_user_id_fkey or wishlists_product_id_fkey) are missing. Run the migration SQL.');
    } else {
      console.log('   ✅ Wishlists table with user and product joins works');
    }

    // Test 10: Test deal_products table with deal and product relationships
    console.log('\n🔟 Testing deal_products table with deal and product joins...');
    const { data: dealProducts, error: dealProductsError } = await supabaseAdmin
      .from('deal_products')
      .select(`
        id,
        deal_id,
        product_id,
        deal:deals!deal_products_deal_id_fkey(id, title),
        product:products!deal_products_product_id_fkey(id, name)
      `)
      .limit(1);

    if (dealProductsError) {
      console.error('   ❌ Error:', dealProductsError.message);
      console.log('   💡 The deal_products foreign keys (deal_products_deal_id_fkey or deal_products_product_id_fkey) are missing. Run the migration SQL.');
    } else {
      console.log('   ✅ Deal products table with deal and product joins works');
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ Database connection test complete!');
    console.log('='.repeat(60));

  } catch (error: any) {
    console.error('\n❌ Database connection failed:', error);
    process.exit(1);
  }
}

checkDatabaseConnection()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });

