import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Validate required environment variables
if (!supabaseUrl) {
  console.error('❌ SUPABASE_URL is missing in environment variables');
  console.error('   Set SUPABASE_URL in Render environment variables');
  throw new Error('SUPABASE_URL is required');
}

if (!supabaseServiceKey) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY is missing in environment variables');
  console.error('   Set SUPABASE_SERVICE_ROLE_KEY in Render environment variables');
  throw new Error('SUPABASE_SERVICE_ROLE_KEY is required');
}

// Validate URL format
if (!supabaseUrl.startsWith('https://') || !supabaseUrl.includes('.supabase.co')) {
  console.error('❌ Invalid SUPABASE_URL format. Expected: https://xxxxx.supabase.co');
  throw new Error('Invalid SUPABASE_URL format');
}

// Validate service role key format (should be a JWT-like string)
if (supabaseServiceKey.length < 100) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY appears to be invalid (too short)');
  console.error('   Make sure you are using the SERVICE_ROLE key, not the ANON key');
  throw new Error('Invalid SUPABASE_SERVICE_ROLE_KEY format');
}

// Admin client with service role key (bypasses RLS)
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

console.log('✅ Supabase Admin Client initialized');
console.log(`   Supabase URL: ${supabaseUrl.substring(0, 30)}...`);
console.log(`   Service Role Key: ${supabaseServiceKey.substring(0, 20)}...`);

export default supabaseAdmin;

