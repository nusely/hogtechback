# Deals Not Showing - Troubleshooting Guide

If deals aren't showing on the deals page or homepage, check the following:

## Common Issues

### 1. Deal Not Active
- **Check**: `is_active` column must be `true`
- **Fix**: Update the deal in admin panel or run:
  ```sql
  UPDATE deals SET is_active = true WHERE id = 'your-deal-id';
  ```

### 2. Date Range Issues
- **Check**: Current date must be between `start_date` and `end_date`
- **Requirements**:
  - `start_date <= NOW()` (deal has started)
  - `end_date >= NOW()` (deal hasn't expired)
- **Fix**: Update dates in admin panel or run:
  ```sql
  UPDATE deals 
  SET start_date = '2024-01-01', 
      end_date = '2025-12-31'
  WHERE id = 'your-deal-id';
  ```

### 3. No Products in Deal
- **Check**: Deal must have at least one product in `deal_products` table
- **Fix**: Add products to the deal via admin panel

### 4. Flash Deals Not Showing on Homepage
- **Requirements**:
  - Deal must have `is_flash_deal = true`
  - Deal must be active and within date range
  - Deal products must have `is_flash_deal = true`
- **Fix**: 
  ```sql
  -- Mark deal as flash deal
  UPDATE deals SET is_flash_deal = true WHERE id = 'your-deal-id';
  
  -- Mark products as flash deal
  UPDATE deal_products SET is_flash_deal = true WHERE deal_id = 'your-deal-id';
  ```

## Diagnostic Queries

Run `check_deals_status.sql` to see:
- Which deals are active
- Which deals are within date range
- How many products each deal has
- Which deals should be showing

## Quick Fix Script

To activate all deals and extend their dates:

```sql
-- Activate all deals and extend dates
UPDATE deals 
SET 
  is_active = true,
  start_date = '2024-01-01',
  end_date = '2025-12-31'
WHERE is_active = false OR start_date > NOW() OR end_date < NOW();
```

## Testing

After making changes:
1. Check browser console for errors
2. Verify API endpoints return data:
   - `/api/deals` - Should return active deals
   - `/api/deals/active/products` - Should return deal products
   - `/api/deals/flash/products` - Should return flash deal products
3. Wait a few seconds for cache to refresh
4. Hard refresh the page (Ctrl+Shift+R)


