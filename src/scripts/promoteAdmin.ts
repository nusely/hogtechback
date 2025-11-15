import { supabaseAdmin } from '../utils/supabaseClient';

async function promoteUserRole(email: string, role: 'admin' | 'superadmin') {
  if (!email) {
    console.error('Email is required');
    process.exit(1);
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('users')
      .update({ role })
      .eq('email', email)
      .select('id, email, role')
      .single();

    if (error) {
      console.error('Failed to promote user:', error);
      process.exit(1);
    }

    if (!data) {
      console.error(`User with email ${email} not found.`);
      process.exit(1);
    }

    console.log(`✅ User ${data.email} promoted to ${role}.`);
    process.exit(0);
  } catch (err) {
    console.error('Unexpected error promoting user:', err);
    process.exit(1);
  }
}

const emailArg = process.argv[2] || 'support@hogtechgh.com';
const roleArg = (process.argv[3] as 'admin' | 'superadmin') || 'admin';

if (!['admin', 'superadmin'].includes(roleArg)) {
  console.error('Invalid role provided. Use "admin" or "superadmin".');
  process.exit(1);
}

promoteUserRole(emailArg, roleArg);

