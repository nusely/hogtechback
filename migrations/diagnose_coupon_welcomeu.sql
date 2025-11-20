-- Diagnostic query to check WELCOMEU coupon
-- Run this in Supabase SQL Editor to verify the coupon exists and its status

SELECT 
  id,
  code,
  name,
  type,
  value,
  is_active,
  valid_from,
  valid_until,
  usage_limit,
  used_count,
  minimum_amount,
  maximum_discount,
  created_at,
  updated_at,
  -- Check if code matches exactly (case-sensitive)
  CASE WHEN code = 'WELCOMEU' THEN 'EXACT MATCH' ELSE 'NO MATCH' END as exact_match,
  -- Check if code matches case-insensitively
  CASE WHEN UPPER(TRIM(code)) = 'WELCOMEU' THEN 'CASE-INSENSITIVE MATCH' ELSE 'NO MATCH' END as case_insensitive_match,
  -- Check validity
  CASE 
    WHEN is_active = false THEN 'INACTIVE'
    WHEN valid_from IS NOT NULL AND valid_from > NOW() THEN 'NOT YET VALID'
    WHEN valid_until IS NOT NULL AND valid_until < NOW() THEN 'EXPIRED'
    WHEN usage_limit IS NOT NULL AND used_count >= usage_limit THEN 'USAGE LIMIT REACHED'
    ELSE 'VALID'
  END as status_check
FROM coupons
WHERE UPPER(TRIM(code)) = 'WELCOMEU'
   OR code ILIKE '%WELCOMEU%';

-- Also list all coupons to see what's in the database
SELECT 
  code,
  name,
  is_active,
  valid_from,
  valid_until,
  usage_limit,
  used_count
FROM coupons
ORDER BY created_at DESC
LIMIT 10;

