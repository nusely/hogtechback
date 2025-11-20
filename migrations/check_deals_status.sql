-- Diagnostic query to check deals status
-- This helps identify why deals aren't showing up

-- Check all deals and their status
SELECT 
    id,
    title,
    is_active,
    is_flash_deal,
    start_date,
    end_date,
    display_order,
    CASE 
        WHEN is_active = false THEN 'Deal is inactive'
        WHEN start_date > NOW() THEN 'Deal has not started yet'
        WHEN end_date < NOW() THEN 'Deal has expired'
        WHEN start_date <= NOW() AND end_date >= NOW() AND is_active = true THEN '✅ Deal is ACTIVE'
        ELSE 'Unknown status'
    END AS status,
    NOW() AS current_time
FROM deals
ORDER BY created_at DESC;

-- Check deal products count per deal
SELECT 
    d.id AS deal_id,
    d.title AS deal_title,
    d.is_active,
    d.is_flash_deal,
    d.start_date,
    d.end_date,
    COUNT(dp.id) AS product_count,
    COUNT(CASE WHEN dp.is_flash_deal = true THEN 1 END) AS flash_product_count
FROM deals d
LEFT JOIN deal_products dp ON dp.deal_id = d.id
GROUP BY d.id, d.title, d.is_active, d.is_flash_deal, d.start_date, d.end_date
ORDER BY d.created_at DESC;

-- Check which deals should be showing (active and within date range)
SELECT 
    d.id,
    d.title,
    d.is_active,
    d.is_flash_deal,
    d.start_date,
    d.end_date,
    COUNT(dp.id) AS product_count
FROM deals d
LEFT JOIN deal_products dp ON dp.deal_id = d.id
WHERE d.is_active = true
    AND d.start_date <= NOW()
    AND d.end_date >= NOW()
GROUP BY d.id, d.title, d.is_active, d.is_flash_deal, d.start_date, d.end_date
ORDER BY d.display_order, d.created_at DESC;

-- Check flash deals specifically
SELECT 
    d.id,
    d.title,
    d.is_active,
    d.is_flash_deal,
    d.start_date,
    d.end_date,
    COUNT(dp.id) AS total_products,
    COUNT(CASE WHEN dp.is_flash_deal = true THEN 1 END) AS flash_products
FROM deals d
LEFT JOIN deal_products dp ON dp.deal_id = d.id
WHERE d.is_active = true
    AND d.is_flash_deal = true
    AND d.start_date <= NOW()
    AND d.end_date >= NOW()
GROUP BY d.id, d.title, d.is_active, d.is_flash_deal, d.start_date, d.end_date;

