-- Production seed data for Hogtech e-commerce
-- Minimal configuration-safe for client environments (no demo orders/customers).

-- Delivery options (essential checkout data)
INSERT INTO public.delivery_options (name, description, price, estimated_days, is_active, applies_to)
VALUES
  ('Express Courier (Accra)', 'Next-business-day delivery within Accra.', 35.00, 1, TRUE, 'all'),
  ('Standard Shipping (Nationwide)', 'Delivery within 2-4 business days across Ghana.', 20.00, 3, TRUE, 'all'),
  ('In-store Pickup', 'Collect your order at the Hogtech showroom after confirmation.', 0.00, 1, TRUE, 'all')
ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description,
                                 price = EXCLUDED.price,
                                 estimated_days = EXCLUDED.estimated_days,
                                 is_active = EXCLUDED.is_active,
                                 applies_to = EXCLUDED.applies_to;

-- Payment methods
INSERT INTO public.payment_methods (name, provider, config, is_active)
VALUES
  ('Paystack', 'Paystack', '{"mode":"live"}'::jsonb, TRUE),
  ('Mobile Money', 'MTN MoMo', '{"instructions":"Pay to merchant ID HOGTECH"}'::jsonb, TRUE)
ON CONFLICT (name) DO UPDATE SET provider = EXCLUDED.provider,
                                 config = EXCLUDED.config,
                                 is_active = EXCLUDED.is_active;

-- Store settings
INSERT INTO public.settings (key, value, category, description, updated_by)
VALUES
  ('store.name', 'Hogtech Storefront', 'general', 'Display name shown on storefront and invoices.', NULL),
  ('store.support_email', 'support@hogtechgh.com', 'general', 'Primary support email address.', NULL),
  ('store.support_phone', '+233 55 000 0000', 'general', 'Primary contact number.', NULL),
  ('store.address', '1 Innovation Street, East Legon, Accra', 'general', 'Physical pickup and returns address.', NULL),
  ('checkout.enable_guest', 'true', 'checkout', 'Allow guest checkout without account creation.', NULL)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value,
                                 category = EXCLUDED.category,
                                 description = EXCLUDED.description;

-- Optional launch promotion
INSERT INTO public.promotions (title, description, banner_image_url, link, type, target_page, start_date, end_date, active)
VALUES
  ('Welcome to Hogtech', 'Discover the latest devices tailored for you.', NULL, '/shop', 'banner', 'homepage', now(), now() + interval '60 days', TRUE)
ON CONFLICT (title) DO UPDATE SET description = EXCLUDED.description,
                                 banner_image_url = EXCLUDED.banner_image_url,
                                 link = EXCLUDED.link,
                                 type = EXCLUDED.type,
                                 target_page = EXCLUDED.target_page,
                                 start_date = EXCLUDED.start_date,
                                 end_date = EXCLUDED.end_date,
                                 active = EXCLUDED.active;
