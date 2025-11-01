-- Migrate existing R2 URLs to custom domain
-- Run this in Supabase SQL Editor after updating R2_PUBLIC_URL in .env
-- Custom domain: files.ventechgadgets.com

-- Update brand logos
UPDATE brands
SET logo_url = REPLACE(
  logo_url,
  'https://a9380daec985adef210d27ca408143da.r2.dev/ventech-images/',
  'https://files.ventechgadgets.com/'
)
WHERE logo_url LIKE '%r2.dev%';

-- Update category images
UPDATE categories
SET image_url = REPLACE(
  image_url,
  'https://a9380daec985adef210d27ca408143da.r2.dev/ventech-images/',
  'https://files.ventechgadgets.com/'
)
WHERE image_url LIKE '%r2.dev%';

-- Update banner images
UPDATE banners
SET image_url = REPLACE(
  image_url,
  'https://a9380daec985adef210d27ca408143da.r2.dev/ventech-images/',
  'https://files.ventechgadgets.com/'
)
WHERE image_url LIKE '%r2.dev%';

-- Update product thumbnails
UPDATE products
SET thumbnail = REPLACE(
  thumbnail,
  'https://a9380daec985adef210d27ca408143da.r2.dev/ventech-images/',
  'https://files.ventechgadgets.com/'
)
WHERE thumbnail LIKE '%r2.dev%';

-- Update product images array
UPDATE products
SET images = (
  SELECT array_agg(
    REPLACE(
      img,
      'https://a9380daec985adef210d27ca408143da.r2.dev/ventech-images/',
      'https://files.ventechgadgets.com/'
    )
  )
  FROM unnest(images) AS img
)
WHERE EXISTS (
  SELECT 1 FROM unnest(images) AS img
  WHERE img LIKE '%r2.dev%'
);

-- Display results - shows how many records were updated
SELECT 'Brands updated:' as type, COUNT(*) as count 
FROM brands 
WHERE logo_url LIKE '%files.ventechgadgets.com%'
UNION ALL
SELECT 'Categories updated:', COUNT(*) 
FROM categories 
WHERE image_url LIKE '%files.ventechgadgets.com%'
UNION ALL
SELECT 'Banners updated:', COUNT(*) 
FROM banners 
WHERE image_url LIKE '%files.ventechgadgets.com%'
UNION ALL
SELECT 'Products updated:', COUNT(*) 
FROM products 
WHERE thumbnail LIKE '%files.ventechgadgets.com%';

