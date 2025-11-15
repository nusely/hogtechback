# Admin User Setup Scripts

## Create/Update Admin User

To create or update the admin user with the new credentials:

```bash
cd gadgetsbackend
npx ts-node src/scripts/createAdminUser.ts
```

This script will:
- Create the admin user `cimons@hogtechgh.com` in Supabase Auth (if it doesn't exist)
- Set the password to `#Cimon$1234321` (automatically hashed by Supabase)
- Set the user's role to `admin` in the `public.users` table
- Auto-confirm the email address

**Note:** Make sure your `.env` file has:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Promote Existing User to Admin

To promote an existing user to admin role:

```bash
npx ts-node src/scripts/promoteAdmin.ts <email> [role]
```

Examples:
```bash
# Promote to admin
npx ts-node src/scripts/promoteAdmin.ts user@example.com admin

# Promote to superadmin
npx ts-node src/scripts/promoteAdmin.ts user@example.com superadmin
```

