// Load environment variables FIRST before any other imports
import dotenv from 'dotenv';
dotenv.config();

import { supabaseAdmin } from '../utils/supabaseClient';

/**
 * Script to create/update admin user
 * 
 * Usage: 
 *   npx ts-node src/scripts/createAdminUser.ts
 * 
 * This script will:
 * 1. Create or update the admin user in Supabase Auth
 * 2. Set the user's role to 'admin' in the public.users table
 */

const ADMIN_EMAIL = 'cimons@hogtechgh.com';
const ADMIN_PASSWORD = '#Cimon$1234321';
const ADMIN_ROLE = 'admin'; // or 'superadmin'

async function createAdminUser() {
  try {
    console.log(`Creating/updating admin user: ${ADMIN_EMAIL}`);

    // Check if user already exists
    const { data: { users }, error: listError } = await supabaseAdmin.auth.admin.listUsers();
    
    if (listError) {
      console.error('Error listing users:', listError);
      process.exit(1);
    }

    const existingUser = users?.find((u: any) => u.email === ADMIN_EMAIL);

    if (existingUser) {
      console.log(`User ${ADMIN_EMAIL} already exists. Updating password and role...`);
      
      // Update password
      const { error: updatePasswordError } = await supabaseAdmin.auth.admin.updateUserById(
        existingUser.id,
        { password: ADMIN_PASSWORD }
      );

      if (updatePasswordError) {
        console.error('Error updating password:', updatePasswordError);
        process.exit(1);
      }

      console.log('✅ Password updated successfully');

      // Update role in public.users table
      const { error: updateRoleError } = await supabaseAdmin
        .from('users')
        .update({ role: ADMIN_ROLE })
        .eq('id', existingUser.id);

      if (updateRoleError) {
        console.error('Error updating role:', updateRoleError);
        process.exit(1);
      }

      console.log(`✅ User role updated to ${ADMIN_ROLE}`);
      console.log(`✅ Admin user ${ADMIN_EMAIL} is ready to use`);
    } else {
      console.log(`Creating new admin user: ${ADMIN_EMAIL}`);
      
      // Create user via Admin API
      const { data: userData, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
        email_confirm: true, // Auto-confirm email for admin
        user_metadata: {
          first_name: 'Cimon',
          last_name: 'Admin',
          full_name: 'Cimon Admin',
        },
      });

      if (createError || !userData?.user) {
        console.error('Error creating user:', createError);
        process.exit(1);
      }

      console.log('✅ User created in Supabase Auth');

      // Wait a moment for the trigger to create the user record
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Update role in public.users table
      const { error: updateRoleError } = await supabaseAdmin
        .from('users')
        .update({ role: ADMIN_ROLE })
        .eq('id', userData.user.id);

      if (updateRoleError) {
        console.error('Error updating role:', updateRoleError);
        // Try to insert if update fails (user might not exist in public.users yet)
        const { error: insertError } = await supabaseAdmin
          .from('users')
          .insert({
            id: userData.user.id,
            email: ADMIN_EMAIL,
            role: ADMIN_ROLE,
            first_name: 'Cimon',
            last_name: 'Admin',
            full_name: 'Cimon Admin',
            email_verified: true,
          });

        if (insertError) {
          console.error('Error inserting user:', insertError);
          process.exit(1);
        }
        console.log('✅ User record inserted in public.users table');
      } else {
        console.log(`✅ User role set to ${ADMIN_ROLE}`);
      }

      console.log(`✅ Admin user ${ADMIN_EMAIL} created successfully`);
      console.log(`   Password: ${ADMIN_PASSWORD}`);
      console.log(`   Role: ${ADMIN_ROLE}`);
    }

    process.exit(0);
  } catch (err) {
    console.error('Unexpected error:', err);
    process.exit(1);
  }
}

// Run the script
createAdminUser();

