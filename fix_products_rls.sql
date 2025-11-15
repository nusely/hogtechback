-- Fix RLS policies for products table to allow admin operations
-- This allows authenticated admin users to create, update, and delete products

-- Drop existing restrictive policy if it exists
DROP POLICY IF EXISTS "Admins can manage products" ON public.products;

-- Create comprehensive policies for products table

-- Policy 1: Allow public to view products
DROP POLICY IF EXISTS "Anyone can view products" ON public.products;
DROP POLICY IF EXISTS "Public can view products" ON public.products;

CREATE POLICY "Anyone can view products" 
ON public.products 
FOR SELECT 
USING (true);

-- Policy 2: Allow admins to insert products
CREATE POLICY "Admins can insert products" 
ON public.products 
FOR INSERT 
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = auth.uid() 
    AND users.role = 'admin'
  )
);

-- Policy 3: Allow admins to update products
CREATE POLICY "Admins can update products" 
ON public.products 
FOR UPDATE 
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = auth.uid() 
    AND users.role = 'admin'
  )
);

-- Policy 4: Allow admins to delete products
CREATE POLICY "Admins can delete products" 
ON public.products 
FOR DELETE 
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = auth.uid() 
    AND users.role = 'admin'
  )
);

-- Also fix other critical tables that admins need to manage

-- Categories
DROP POLICY IF EXISTS "Admins can manage categories" ON public.categories;

CREATE POLICY "Anyone can view categories" ON public.categories FOR SELECT USING (true);
CREATE POLICY "Admins can insert categories" ON public.categories FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.users WHERE users.id = auth.uid() AND users.role = 'admin'));
CREATE POLICY "Admins can update categories" ON public.categories FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.users WHERE users.id = auth.uid() AND users.role = 'admin'));
CREATE POLICY "Admins can delete categories" ON public.categories FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.users WHERE users.id = auth.uid() AND users.role = 'admin'));

-- Brands
DROP POLICY IF EXISTS "Admins can manage brands" ON public.brands;

CREATE POLICY "Anyone can view brands" ON public.brands FOR SELECT USING (true);
CREATE POLICY "Admins can insert brands" ON public.brands FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.users WHERE users.id = auth.uid() AND users.role = 'admin'));
CREATE POLICY "Admins can update brands" ON public.brands FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.users WHERE users.id = auth.uid() AND users.role = 'admin'));
CREATE POLICY "Admins can delete brands" ON public.brands FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.users WHERE users.id = auth.uid() AND users.role = 'admin'));

-- Create Media files table if it doesn't exist (for R2 uploads)
CREATE TABLE IF NOT EXISTS public.media_files (
    id uuid DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    filename varchar(255) NOT NULL,
    original_name varchar(255) NOT NULL,
    url text NOT NULL,
    folder varchar(100) NOT NULL,
    size bigint NOT NULL,
    mime_type varchar(100) NOT NULL,
    file_hash varchar(64),
    width integer,
    height integer,
    alt_text text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Enable RLS and set policies for media files
ALTER TABLE public.media_files ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage media" ON public.media_files;
DROP POLICY IF EXISTS "Anyone can view media" ON public.media_files;
DROP POLICY IF EXISTS "Admins can insert media" ON public.media_files;
DROP POLICY IF EXISTS "Admins can update media" ON public.media_files;
DROP POLICY IF EXISTS "Admins can delete media" ON public.media_files;

CREATE POLICY "Anyone can view media" ON public.media_files FOR SELECT USING (true);
CREATE POLICY "Admins can insert media" ON public.media_files FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.users WHERE users.id = auth.uid() AND users.role = 'admin'));
CREATE POLICY "Admins can update media" ON public.media_files FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.users WHERE users.id = auth.uid() AND users.role = 'admin'));
CREATE POLICY "Admins can delete media" ON public.media_files FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.users WHERE users.id = auth.uid() AND users.role = 'admin'));

