// Load environment variables FIRST before any other imports
import dotenv from 'dotenv';
dotenv.config();

import { supabaseAdmin } from '../utils/supabaseClient';
import * as fs from 'fs';
import * as path from 'path';

async function applyMigration(migrationFile: string) {
  try {
    const migrationPath = path.join(__dirname, '..', '..', 'migrations', migrationFile);
    
    if (!fs.existsSync(migrationPath)) {
      console.error(`❌ Migration file not found: ${migrationPath}`);
      return;
    }

    const sql = fs.readFileSync(migrationPath, 'utf-8');
    
    console.log(`📄 Applying migration: ${migrationFile}`);
    console.log(`SQL:\n${sql}\n`);

    // Execute SQL using Supabase RPC or direct query
    // Note: Supabase JS client doesn't support raw SQL execution directly
    // We'll need to use the REST API or run this in Supabase SQL editor
    console.log('⚠️  Supabase JS client cannot execute raw SQL directly.');
    console.log('📋 Please run this SQL in your Supabase SQL Editor:');
    console.log('\n' + '='.repeat(60));
    console.log(sql);
    console.log('='.repeat(60) + '\n');
    
    // Alternatively, we can check if the column exists
    const { data, error } = await supabaseAdmin
      .from('notifications')
      .select('read_at')
      .limit(1);

    if (error) {
      if (error.message.includes('column') && error.message.includes('does not exist')) {
        console.log('❌ Column `read_at` does not exist. Please run the SQL above.');
      } else {
        console.error('Error checking column:', error);
      }
    } else {
      console.log('✅ Column `read_at` appears to exist (or table is empty)');
    }

  } catch (error: any) {
    console.error('❌ Error applying migration:', error);
  }
}

// Get migration file from command line args
const migrationFile = process.argv[2] || 'add_read_at_to_notifications.sql';

applyMigration(migrationFile)
  .then(() => {
    console.log('\n✅ Migration check complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Migration check failed:', error);
    process.exit(1);
  });

