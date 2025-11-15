-- Fix RLS policies to allow user profile creation
-- This script adds missing INSERT policies for the users table

-- Drop existing policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.users;
DROP POLICY IF EXISTS "Allow authenticated users to insert their profile" ON public.users;

-- Allow authenticated users to insert their own user record
CREATE POLICY "Users can insert their own profile"
ON public.users
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id);

-- Also allow service role to insert (for admin operations)
-- This policy should already exist, but we'll ensure it's there
DROP POLICY IF EXISTS "Service role can manage all users" ON public.users;
CREATE POLICY "Service role can manage all users"
ON public.users
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Verify existing policies for SELECT and UPDATE
-- Users should be able to read and update their own profile
DROP POLICY IF EXISTS "Users can view their own profile" ON public.users;
CREATE POLICY "Users can view their own profile"
ON public.users
FOR SELECT
TO authenticated
USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update their own profile" ON public.users;
CREATE POLICY "Users can update their own profile"
ON public.users
FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- Allow public (anonymous) users to read certain user fields (for reviews, etc.)
DROP POLICY IF EXISTS "Public users can view user profiles" ON public.users;
CREATE POLICY "Public users can view user profiles"
ON public.users
FOR SELECT
TO anon, authenticated
USING (true);

