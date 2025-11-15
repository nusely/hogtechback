-- Development seed data for Hogtech e-commerce
-- Safe to run multiple times; uses conditional inserts to avoid duplicates.

-- Brands
INSERT INTO public.brands (name, slug, description, website, show_in_mega_menu, product_count, "order")
SELECT 'Hedgehog Electronics', 'hedgehog-electronics', 'Signature devices and accessories from Hogtech.', 'https://hogtechgh.com', TRUE, 0, 1
WHERE NOT EXISTS (SELECT 1 FROM public.brands WHERE slug = 'hedgehog-electronics');

INSERT INTO public.brands (name, slug, description, website, show_in_mega_menu, product_count, "order")
SELECT 'Volt Avenue', 'volt-avenue', 'Trusted third-party gadgets curated by Hogtech.', 'https://voltavenue.example', FALSE, 0, 2
WHERE NOT EXISTS (SELECT 1 FROM public.brands WHERE slug = 'volt-avenue');

-- Categories
INSERT INTO public.categories (name, slug, description, image_url, parent_id, show_in_mega_menu, mega_menu_column, "order", product_count)
SELECT 'Laptops', 'laptops', 'Performance notebooks for professionals and students.', 'https://files.hogtechgh.com/demo/laptops.webp', NULL, TRUE, 'left', 1, 0
WHERE NOT EXISTS (SELECT 1 FROM public.categories WHERE slug = 'laptops');

INSERT INTO public.categories (name, slug, description, image_url, parent_id, show_in_mega_menu, mega_menu_column, "order", product_count)
SELECT 'Accessories', 'accessories', 'Keyboards, mice, hubs and more.', 'https://files.hogtechgh.com/demo/accessories.webp', NULL, TRUE, 'right', 2, 0
WHERE NOT EXISTS (SELECT 1 FROM public.categories WHERE slug = 'accessories');

-- Delivery options
INSERT INTO public.delivery_options (name, description, price, estimated_days, is_active, applies_to)
SELECT 'Express Courier (Accra)', 'Next-business-day courier delivery within Accra.', 35.00, 1, TRUE, 'all'
WHERE NOT EXISTS (SELECT 1 FROM public.delivery_options WHERE name = 'Express Courier (Accra)');

INSERT INTO public.delivery_options (name, description, price, estimated_days, is_active, applies_to)
SELECT 'Standard Shipping (Nationwide)', 'Delivery within 2-4 business days across Ghana.', 20.00, 3, TRUE, 'all'
WHERE NOT EXISTS (SELECT 1 FROM public.delivery_options WHERE name = 'Standard Shipping (Nationwide)');

INSERT INTO public.delivery_options (name, description, price, estimated_days, is_active, applies_to)
SELECT 'In-store Pickup', 'Collect your order at the Hogtech showroom after confirmation.', 0.00, 1, TRUE, 'all'
WHERE NOT EXISTS (SELECT 1 FROM public.delivery_options WHERE name = 'In-store Pickup');

-- Payment methods
INSERT INTO public.payment_methods (name, provider, config, is_active)
SELECT 'Paystack', 'Paystack', '{"mode":"test"}'::jsonb, TRUE
WHERE NOT EXISTS (SELECT 1 FROM public.payment_methods WHERE name = 'Paystack');

INSERT INTO public.payment_methods (name, provider, config, is_active)
SELECT 'Mobile Money', 'MTN MoMo', '{"instructions":"Pay to merchant ID HOGTECH"}'::jsonb, TRUE
WHERE NOT EXISTS (SELECT 1 FROM public.payment_methods WHERE name = 'Mobile Money');

-- Promotions
INSERT INTO public.promotions (title, description, banner_image_url, link, type, target_page, start_date, end_date, active)
SELECT 'Back to Campus Deals', 'Save up to 15% on student essentials all month long.', 'https://files.hogtechgh.com/demo/back-to-campus.webp', '/shop/deals', 'banner', 'homepage', now(), now() + interval '30 days', TRUE
WHERE NOT EXISTS (SELECT 1 FROM public.promotions WHERE title = 'Back to Campus Deals');

-- Sidebar Ads
INSERT INTO public.sidebar_ads (title, image_url, link, position, show_on, slider_group, active, sort_order)
SELECT 'Need a Workhorse Laptop?', 'https://files.hogtechgh.com/demo/sidebar-ultrabook.webp', '/shop/laptops', 'right', '["homepage"]'::jsonb, NULL, TRUE, 1
WHERE NOT EXISTS (SELECT 1 FROM public.sidebar_ads WHERE title = 'Need a Workhorse Laptop?');

-- Products
INSERT INTO public.products (name, slug, description, category_id, brand_id, price, discount_price, discount_percentage, in_stock, stock_quantity, images, thumbnail, specs, features, key_features, specifications, warranty)
SELECT
  'Hogtech Ultrabook 14',
  'hogtech-ultrabook-14',
  'Ultra-slim 14" notebook with Intel Core i7 power, 16GB RAM and 512GB SSD.',
  c.id,
  b.id,
  5499.00,
  4999.00,
  9,
  TRUE,
  25,
  ARRAY['https://files.hogtechgh.com/demo/ultrabook-front.webp','https://files.hogtechgh.com/demo/ultrabook-side.webp'],
  'https://files.hogtechgh.com/demo/ultrabook-thumb.webp',
  '{"cpu":"Intel Core i7","ram":"16GB","storage":"512GB SSD","display":"14 inch FHD"}'::jsonb,
  ARRAY['Lightweight magnesium build','All-day battery life','WiFi 6 connectivity'],
  'Portable productivity for professionals on the go.',
  'The Hogtech Ultrabook 14 pairs premium materials with the latest Intel platform to keep you ahead of demanding workloads.',
  '24 months manufacturer warranty'
FROM public.categories c
JOIN public.brands b ON b.slug = 'hedgehog-electronics'
WHERE c.slug = 'laptops'
AND NOT EXISTS (SELECT 1 FROM public.products WHERE slug = 'hogtech-ultrabook-14');

INSERT INTO public.products (name, slug, description, category_id, brand_id, price, in_stock, stock_quantity, images, thumbnail, specs, features, key_features, specifications, warranty)
SELECT
  'Volt Avenue USB-C Hub Pro',
  'volt-avenue-usbc-hub-pro',
  '8-in-1 USB-C aluminium dock with HDMI, Ethernet and power delivery.',
  c.id,
  b.id,
  699.00,
  TRUE,
  80,
  ARRAY['https://files.hogtechgh.com/demo/hub-front.webp'],
  'https://files.hogtechgh.com/demo/hub-thumb.webp',
  '{"ports":8,"pd":"100W","hdmi":"4K60"}'::jsonb,
  ARRAY['Premium aluminium chassis','Reliable Gigabit Ethernet','Fast SD and microSD readers'],
  'Expand your laptop connectivity instantly.',
  'Ideal companion for remote workstations and content creators.',
  '12 months distributor warranty'
FROM public.categories c
JOIN public.brands b ON b.slug = 'volt-avenue'
WHERE c.slug = 'accessories'
AND NOT EXISTS (SELECT 1 FROM public.products WHERE slug = 'volt-avenue-usbc-hub-pro');

-- Product attributes
INSERT INTO public.product_attributes (name, slug, type, display_order, is_required)
SELECT 'Colour', 'colour', 'select', 1, FALSE
WHERE NOT EXISTS (SELECT 1 FROM public.product_attributes WHERE slug = 'colour');

INSERT INTO public.product_attributes (name, slug, type, display_order, is_required)
SELECT 'Storage', 'storage', 'select', 2, FALSE
WHERE NOT EXISTS (SELECT 1 FROM public.product_attributes WHERE slug = 'storage');

-- Attribute options
INSERT INTO public.product_attribute_options (attribute_id, value, label, price_modifier, stock_quantity, sku_suffix, display_order, is_available)
SELECT pa.id, opt.value, opt.label, opt.price_modifier, 0, opt.sku_suffix, opt.display_order, TRUE
FROM public.product_attributes pa
JOIN (VALUES
    ('colour','silver','Silver',0,'-SLV',1),
    ('colour','space-grey','Space Grey',0,'-SGY',2),
    ('storage','512gb','512GB SSD',0,'-512',1),
    ('storage','1tb','1TB SSD',600,'-1TB',2)
) AS opt(attribute_slug,value,label,price_modifier,sku_suffix,display_order)
  ON pa.slug = opt.attribute_slug
WHERE NOT EXISTS (
  SELECT 1 FROM public.product_attribute_options pao
  WHERE pao.attribute_id = pa.id AND pao.value = opt.value
);

-- Map attributes to products
INSERT INTO public.product_attribute_mappings (product_id, attribute_id, is_required, display_order)
SELECT p.id, pa.id, TRUE, pa.display_order
FROM public.products p
JOIN public.product_attributes pa ON pa.slug IN ('colour','storage')
WHERE p.slug = 'hogtech-ultrabook-14'
AND NOT EXISTS (
  SELECT 1 FROM public.product_attribute_mappings pam
  WHERE pam.product_id = p.id AND pam.attribute_id = pa.id
);

INSERT INTO public.product_attribute_option_mappings (product_id, attribute_id, option_id, stock_quantity, is_available)
SELECT p.id, pa.id, o.id, 10, TRUE
FROM public.products p
JOIN public.product_attributes pa ON pa.slug = 'colour'
JOIN public.product_attribute_options o ON o.attribute_id = pa.id AND o.value IN ('silver','space-grey')
WHERE p.slug = 'hogtech-ultrabook-14'
AND NOT EXISTS (
  SELECT 1 FROM public.product_attribute_option_mappings paom
  WHERE paom.product_id = p.id AND paom.attribute_id = pa.id AND paom.option_id = o.id
);

-- Sample review
INSERT INTO public.reviews (product_id, user_id, rating, title, comment, images, verified_purchase, helpful_count, is_approved)
SELECT p.id, NULL, 5, 'Perfect balance of power and portability', 'The Hogtech Ultrabook 14 handles Adobe CC and VS Code without breaking a sweat. Battery easily lasts through long meetings.', ARRAY[]::text[], TRUE, 3, TRUE
FROM public.products p
WHERE p.slug = 'hogtech-ultrabook-14'
AND NOT EXISTS (
  SELECT 1 FROM public.reviews r
  WHERE r.product_id = p.id AND r.title = 'Perfect balance of power and portability'
);

-- Settings (with upsert logic)
INSERT INTO public.settings (key, value, category, description, updated_by)
SELECT 'store.name', 'Hogtech Storefront', 'general', 'Display name shown on storefront and invoices.', NULL
WHERE NOT EXISTS (SELECT 1 FROM public.settings WHERE key = 'store.name');

INSERT INTO public.settings (key, value, category, description, updated_by)
SELECT 'store.support_email', 'support@hogtechgh.com', 'general', 'Primary support email address.', NULL
WHERE NOT EXISTS (SELECT 1 FROM public.settings WHERE key = 'store.support_email');

INSERT INTO public.settings (key, value, category, description, updated_by)
SELECT 'store.phone', '+233 55 000 0000', 'general', 'Primary contact number.', NULL
WHERE NOT EXISTS (SELECT 1 FROM public.settings WHERE key = 'store.phone');

INSERT INTO public.settings (key, value, category, description, updated_by)
SELECT 'checkout.enable_guest', 'true', 'checkout', 'Allow guest checkout without account creation.', NULL
WHERE NOT EXISTS (SELECT 1 FROM public.settings WHERE key = 'checkout.enable_guest');
