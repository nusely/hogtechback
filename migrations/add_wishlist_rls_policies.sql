-- Migration: Add RLS policies for wishlists table
-- This migration adds INSERT, UPDATE, and DELETE policies for authenticated users
-- The SELECT policy already exists: "Users can view own wishlist"

-- Drop existing policies if they exist (idempotent)
DROP POLICY IF EXISTS "Users can insert own wishlist" ON "public"."wishlists";
DROP POLICY IF EXISTS "Users can update own wishlist" ON "public"."wishlists";
DROP POLICY IF EXISTS "Users can delete own wishlist" ON "public"."wishlists";

-- INSERT policy: Users can add items to their own wishlist
CREATE POLICY "Users can insert own wishlist" 
ON "public"."wishlists" 
FOR INSERT 
TO "authenticated" 
WITH CHECK (("user_id" = "auth"."uid"()));

-- UPDATE policy: Users can update their own wishlist items
CREATE POLICY "Users can update own wishlist" 
ON "public"."wishlists" 
FOR UPDATE 
TO "authenticated" 
USING (("user_id" = "auth"."uid"())) 
WITH CHECK (("user_id" = "auth"."uid"()));

-- DELETE policy: Users can remove items from their own wishlist
CREATE POLICY "Users can delete own wishlist" 
ON "public"."wishlists" 
FOR DELETE 
TO "authenticated" 
USING (("user_id" = "auth"."uid"()));

-- Verify policies exist
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies
WHERE tablename = 'wishlists'
ORDER BY policyname;

