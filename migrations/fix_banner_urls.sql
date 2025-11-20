-- Migration: Fix malformed Banner URLs
-- This script fixes HTML encoded characters and malformed URLs in the banners table

-- 1. Fix HTML entities
UPDATE banners
SET image_url = REPLACE(
  REPLACE(
    REPLACE(
      REPLACE(
        REPLACE(image_url, '&#x2F;', '/'),
        '&#x2f;', '/'
      ),
      '&amp;', '&'
    ),
    '&#39;', ''''
  ),
  '&quot;', '"'
),
link = REPLACE(
  REPLACE(
    REPLACE(
      REPLACE(
        REPLACE(link, '&#x2F;', '/'),
        '&#x2f;', '/'
      ),
      '&amp;', '&'
    ),
    '&#39;', ''''
  ),
  '&quot;', '"'
);

-- 2. Remove leading '&' if present (artifact of double encoding/decoding)
UPDATE banners
SET image_url = SUBSTRING(image_url FROM 2)
WHERE image_url LIKE '&%';

UPDATE banners
SET link = SUBSTRING(link FROM 2)
WHERE link LIKE '&%';

-- 3. Fix protocol-relative URLs (starting with //)
UPDATE banners
SET image_url = 'https:' || image_url
WHERE image_url LIKE '//%';

UPDATE banners
SET link = 'https:' || link
WHERE link LIKE '//%';

-- 4. Fix relative paths (assume they are hosted on files.hogtechgh.com)
UPDATE banners
SET image_url = 'https://files.hogtechgh.com' || image_url
WHERE image_url LIKE '/banners%';

-- 5. Fix any double https:// (just in case)
UPDATE banners
SET image_url = REPLACE(image_url, 'https://https://', 'https://')
WHERE image_url LIKE 'https://https://%';

-- Verify results
SELECT id, title, image_url FROM banners;

