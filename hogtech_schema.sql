-- Hogtech Database Schema
-- Clean rebuild for Supabase
-- Ensure extensions uuid-ossp, pgcrypto are enabled in Supabase dashboard before running

-- Drop all tables in dependency order
DROP TABLE IF EXISTS public.activity_logs CASCADE;
DROP TABLE IF EXISTS public.activities CASCADE;
DROP TABLE IF EXISTS public.notification_preferences CASCADE;
DROP TABLE IF EXISTS public.notifications CASCADE;
DROP TABLE IF EXISTS public.reviews CASCADE;
DROP TABLE IF EXISTS public.deal_products CASCADE;
DROP TABLE IF EXISTS public.deals CASCADE;
DROP TABLE IF EXISTS public.delivery_options CASCADE;
DROP TABLE IF EXISTS public.transactions CASCADE;
DROP TABLE IF EXISTS public.payment_methods CASCADE;
DROP TABLE IF EXISTS public.customers CASCADE;
DROP TABLE IF EXISTS public.taxes CASCADE;
DROP TABLE IF EXISTS public.discounts CASCADE;
DROP TABLE IF EXISTS public.coupons CASCADE;
DROP TABLE IF EXISTS public.order_items CASCADE;
DROP TABLE IF EXISTS public.orders CASCADE;
DROP TABLE IF EXISTS public.product_variant_stock CASCADE;
DROP TABLE IF EXISTS public.product_attribute_option_mappings CASCADE;
DROP TABLE IF EXISTS public.product_attribute_mappings CASCADE;
DROP TABLE IF EXISTS public.product_attribute_options CASCADE;
DROP TABLE IF EXISTS public.product_attributes CASCADE;
DROP TABLE IF EXISTS public.product_variants CASCADE;
DROP TABLE IF EXISTS public.product_brands CASCADE;
DROP TABLE IF EXISTS public.cart_items CASCADE;
DROP TABLE IF EXISTS public.wishlists CASCADE;
DROP TABLE IF EXISTS public.media_library CASCADE;
DROP TABLE IF EXISTS public.mega_menu_items CASCADE;
DROP TABLE IF EXISTS public.promotions CASCADE;
DROP TABLE IF EXISTS public.settings CASCADE;
DROP TABLE IF EXISTS public.sidebar_ads CASCADE;
DROP TABLE IF EXISTS public.products CASCADE;
DROP TABLE IF EXISTS public.categories CASCADE;
DROP TABLE IF EXISTS public.brands CASCADE;
DROP TABLE IF EXISTS public.banners CASCADE;
DROP TABLE IF EXISTS public.admin_logs CASCADE;
DROP TABLE IF EXISTS public.users CASCADE;
DROP SEQUENCE IF EXISTS public.order_number_seq;

-- Functions
CREATE OR REPLACE FUNCTION public.calculate_discount(amount numeric, discount_type character varying DEFAULT 'all'::character varying)
RETURNS numeric
LANGUAGE plpgsql
AS $$
DECLARE
  total_discount DECIMAL(10,2) := 0;
  discount_record RECORD;
BEGIN
  FOR discount_record IN 
    SELECT value, type, minimum_amount, maximum_discount
    FROM discounts 
    WHERE is_active = TRUE 
    AND (applies_to = 'all' OR applies_to = discount_type)
    AND valid_from <= NOW()
    AND (valid_until IS NULL OR valid_until >= NOW())
    AND (usage_limit IS NULL OR used_count < usage_limit)
    AND amount >= minimum_amount
  LOOP
    IF discount_record.type = 'percentage' THEN
      total_discount := total_discount + LEAST(
        amount * discount_record.value / 100,
        COALESCE(discount_record.maximum_discount, amount * discount_record.value / 100)
      );
    ELSIF discount_record.type = 'fixed_amount' THEN
      total_discount := total_discount + discount_record.value;
    ELSIF discount_record.type = 'free_shipping' THEN
      total_discount := total_discount;
    END IF;
  END LOOP;
  
  RETURN ROUND(LEAST(total_discount, amount), 2);
END;
$$;

CREATE OR REPLACE FUNCTION public.calculate_tax(amount numeric, tax_type character varying DEFAULT 'all'::character varying)
RETURNS numeric
LANGUAGE plpgsql
AS $$
DECLARE
  total_tax DECIMAL(10,2) := 0;
  tax_record RECORD;
BEGIN
  FOR tax_record IN 
    SELECT rate, type 
    FROM taxes 
    WHERE is_active = TRUE 
    AND (applies_to = 'all' OR applies_to = tax_type)
  LOOP
    IF tax_record.type = 'percentage' THEN
      total_tax := total_tax + (amount * tax_record.rate);
    ELSIF tax_record.type = 'fixed' THEN
      total_tax := total_tax + tax_record.rate;
    END IF;
  END LOOP;
  
  RETURN ROUND(total_tax, 2);
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_coupon_code()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  chars TEXT := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  result TEXT := '';
  i INTEGER;
BEGIN
  FOR i IN 1..8 LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
  END LOOP;
  RETURN result;
END;
$$;

CREATE SEQUENCE public.order_number_seq START WITH 1 INCREMENT BY 1;

CREATE OR REPLACE FUNCTION public.generate_order_number()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  new_order_number TEXT;
BEGIN
  new_order_number := 'HT' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(nextval('order_number_seq')::TEXT, 5, '0');
  RETURN new_order_number;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_product_with_variants(product_slug text)
RETURNS json
LANGUAGE plpgsql
AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'product', row_to_json(p.*),
    'attributes', (
      SELECT json_agg(
        json_build_object(
          'attribute', row_to_json(pa.*),
          'options', (
            SELECT json_agg(row_to_json(pao.*))
            FROM product_attribute_options pao
            WHERE pao.attribute_id = pa.id
            AND pao.is_available = true
            ORDER BY pao.display_order
          )
        )
      )
      FROM product_attribute_mappings pam
      JOIN product_attributes pa ON pa.id = pam.attribute_id
      WHERE pam.product_id = p.id
      ORDER BY pam.display_order
    )
  ) INTO result
  FROM products p
  WHERE p.slug = product_slug;
  
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  first_name_val VARCHAR(255);
  last_name_val VARCHAR(255);
  full_name_val VARCHAR(255);
BEGIN
  first_name_val := COALESCE(
    NEW.raw_user_meta_data->>'first_name',
    NEW.raw_user_meta_data->>'firstName',
    ''
  );
  
  last_name_val := COALESCE(
    NEW.raw_user_meta_data->>'last_name',
    NEW.raw_user_meta_data->>'lastName',
    ''
  );
  
  full_name_val := TRIM(CONCAT(first_name_val, ' ', last_name_val));
  
  IF full_name_val = '' OR full_name_val IS NULL THEN
    full_name_val := COALESCE(
      NEW.raw_user_meta_data->>'name',
      NEW.raw_user_meta_data->>'full_name',
      NEW.email
    );
  END IF;
  
  INSERT INTO public.users (id, email, first_name, last_name, full_name, phone, role)
  VALUES (
    NEW.id,
    NEW.email,
    first_name_val,
    last_name_val,
    full_name_val,
    NEW.phone,
    'customer'
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    first_name = EXCLUDED.first_name,
    last_name = EXCLUDED.last_name,
    full_name = EXCLUDED.full_name,
    phone = EXCLUDED.phone,
    updated_at = now();
  
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_admin(user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  user_role TEXT;
BEGIN
  SELECT role INTO user_role FROM public.users WHERE id = user_id;
  RETURN user_role IN ('admin', 'superadmin');
END;
$$;

CREATE OR REPLACE FUNCTION public.set_customers_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_deals_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_delivery_options_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_notifications_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_product_rating()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  avg_rating NUMERIC;
  total_reviews INTEGER;
BEGIN
  SELECT AVG(rating), COUNT(*) 
  INTO avg_rating, total_reviews
  FROM reviews 
  WHERE product_id = NEW.product_id AND is_approved = true;
  
  UPDATE products 
  SET 
    rating = COALESCE(avg_rating, 0),
    review_count = total_reviews
  WHERE id = NEW.product_id;
  
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_settings_timestamp()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_variant_stock_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_coupon(coupon_code text, cart_amount numeric)
RETURNS json
LANGUAGE plpgsql
AS $$
DECLARE
  coupon_record RECORD;
  discount_amount NUMERIC;
  result JSON;
BEGIN
  SELECT * INTO coupon_record
  FROM coupons
  WHERE code = coupon_code
  AND is_active = true
  AND valid_from <= NOW()
  AND (valid_until IS NULL OR valid_until >= NOW())
  AND (usage_limit IS NULL OR used_count < usage_limit)
  AND cart_amount >= minimum_amount;
  
  IF coupon_record.id IS NULL THEN
    RETURN json_build_object('valid', false, 'message', 'Invalid or expired coupon');
  END IF;
  
  IF coupon_record.type = 'percentage' THEN
    discount_amount := cart_amount * coupon_record.value / 100;
    IF coupon_record.maximum_discount IS NOT NULL THEN
      discount_amount := LEAST(discount_amount, coupon_record.maximum_discount);
    END IF;
  ELSIF coupon_record.type = 'fixed_amount' THEN
    discount_amount := coupon_record.value;
  ELSIF coupon_record.type = 'free_delivery' THEN
    discount_amount := 0;
  END IF;
  
  result := json_build_object(
    'valid', true,
    'discount', discount_amount,
    'type', coupon_record.type,
    'code', coupon_record.code
  );
  
  RETURN result;
END;
$$;

-- Tables
CREATE TABLE public.admin_logs (
    id uuid DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    action text NOT NULL,
    user_id uuid,
    role text,
    status_code integer,
    duration_ms integer,
    ip_address text,
    created_at timestamptz DEFAULT now() NOT NULL,
    metadata jsonb
);

CREATE TABLE public.banners (
    id uuid DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    title varchar(255) NOT NULL,
    subtitle text,
    image_url text NOT NULL,
    link varchar(500),
    button_text varchar(50),
    active boolean DEFAULT true,
    "order" integer DEFAULT 0,
    start_date timestamptz,
    end_date timestamptz,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.brands (
    id uuid DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    name varchar(100) NOT NULL,
    slug varchar(100) NOT NULL UNIQUE,
    logo_url text,
    description text,
    website varchar(255),
    show_in_mega_menu boolean DEFAULT false,
    product_count integer DEFAULT 0,
    "order" integer DEFAULT 0,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.categories (
    id uuid DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    name varchar(100) NOT NULL,
    slug varchar(100) NOT NULL UNIQUE,
    description text,
    image_url text,
    parent_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
    show_in_mega_menu boolean DEFAULT false,
    mega_menu_column varchar(50),
    "order" integer DEFAULT 0,
    product_count integer DEFAULT 0,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.users (
    id uuid DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    email varchar(255) NOT NULL,
    phone varchar(20),
    avatar_url text,
    role varchar(20) DEFAULT 'customer',
    email_verified boolean DEFAULT false,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    first_name varchar(255),
    last_name varchar(255),
    shipping_address jsonb DEFAULT '{}'::jsonb,
    billing_address jsonb DEFAULT '{}'::jsonb,
    date_of_birth date,
    gender varchar(20),
    newsletter_subscribed boolean DEFAULT false,
    sms_notifications boolean DEFAULT true,
    email_notifications boolean DEFAULT true,
    full_name varchar(255),
    CONSTRAINT users_role_check CHECK (role IN ('customer','admin','superadmin'))
);

CREATE TABLE public.products (
    id uuid DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    name varchar(255) NOT NULL,
    slug varchar(255) NOT NULL UNIQUE,
    description text,
    category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
    brand_id uuid REFERENCES public.brands(id) ON DELETE SET NULL,
    price numeric(10,2) NOT NULL,
    discount_price numeric(10,2),
    discount_percentage integer,
    in_stock boolean DEFAULT true,
    stock_quantity integer DEFAULT 0,
    images text[],
    thumbnail text,
    is_featured boolean DEFAULT false,
    rating numeric(3,2) DEFAULT 0,
    review_count integer DEFAULT 0,
    specs jsonb,
    features text[],
    sku varchar(100),
    weight numeric(10,2),
    dimensions jsonb,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    rating_count integer DEFAULT 0,
    reviews_count integer DEFAULT 0,
    is_flash_deal boolean DEFAULT false,
    flash_deal_start timestamptz,
    flash_deal_end timestamptz,
    flash_deal_discount integer DEFAULT 0,
    flash_deal_price numeric(10,2),
    key_features text,
    specifications text,
    warranty text
);

CREATE TABLE public.product_attributes (
    id uuid DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    name varchar(100) NOT NULL,
    slug varchar(100) NOT NULL UNIQUE,
    type varchar(50) NOT NULL,
    display_order integer DEFAULT 0,
    is_required boolean DEFAULT false,
    created_at timestamptz DEFAULT now()
);

CREATE TABLE public.product_attribute_options (
    id uuid DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    attribute_id uuid NOT NULL REFERENCES public.product_attributes(id) ON DELETE CASCADE,
    value varchar(100) NOT NULL,
    label varchar(100) NOT NULL,
    price_modifier numeric(10,2) DEFAULT 0,
    stock_quantity integer DEFAULT 0,
    sku_suffix varchar(50),
    display_order integer DEFAULT 0,
    is_available boolean DEFAULT true,
    created_at timestamptz DEFAULT now()
);

CREATE TABLE public.product_attribute_mappings (
    id uuid DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    attribute_id uuid NOT NULL REFERENCES public.product_attributes(id) ON DELETE CASCADE,
    is_required boolean DEFAULT true,
    display_order integer DEFAULT 0,
    created_at timestamptz DEFAULT now(),
    UNIQUE (product_id, attribute_id)
);

CREATE TABLE public.product_attribute_option_mappings (
    id uuid DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    attribute_id uuid NOT NULL REFERENCES public.product_attributes(id) ON DELETE CASCADE,
    option_id uuid NOT NULL REFERENCES public.product_attribute_options(id) ON DELETE CASCADE,
    created_at timestamptz DEFAULT now(),
    stock_quantity integer DEFAULT 0,
    is_available boolean DEFAULT true
);

CREATE TABLE public.product_variants (
    id uuid DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
    type varchar(50) NOT NULL,
    value varchar(100) NOT NULL,
    label varchar(100) NOT NULL,
    price_adjustment numeric(10,2) DEFAULT 0,
    in_stock boolean DEFAULT true,
    "order" integer DEFAULT 0,
    created_at timestamptz DEFAULT now()
);

CREATE TABLE public.product_variant_stock (
    id uuid DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    variant_combination jsonb NOT NULL,
    stock_quantity integer DEFAULT 0 NOT NULL,
    sku varchar(100),
    is_available boolean DEFAULT true,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.product_brands (
    product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
    PRIMARY KEY (product_id, brand_id)
);

CREATE TABLE public.orders (
    id uuid DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    user_id uuid,
    order_number varchar(50) NOT NULL UNIQUE,
    status varchar(50) DEFAULT 'pending',
    subtotal numeric(10,2) NOT NULL,
    discount numeric(10,2) DEFAULT 0,
    tax numeric(10,2) DEFAULT 0,
    shipping_fee numeric(10,2) DEFAULT 0,
    total numeric(10,2) NOT NULL,
    payment_method varchar(50),
    payment_status varchar(50) DEFAULT 'pending',
    shipping_address jsonb NOT NULL,
    billing_address jsonb,
    tracking_number varchar(100),
    notes text,
    discount_code text,
    customer_id uuid,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    CONSTRAINT orders_status_check CHECK (status IN ('pending','processing','shipped','delivered','cancelled')),
    CONSTRAINT orders_payment_status_check CHECK (payment_status IN ('pending','paid','failed','refunded'))
);

CREATE TABLE public.order_items (
    id uuid DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    product_id uuid,
    product_name text,
    quantity integer NOT NULL CHECK (quantity > 0),
    unit_price numeric(10,2) NOT NULL,
    discount numeric(10,2) DEFAULT 0,
    subtotal numeric(10,2) NOT NULL,
    variant_options jsonb,
    created_at timestamptz DEFAULT now()
);

CREATE TABLE public.coupons (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    code varchar(8) NOT NULL UNIQUE,
    name varchar(255) NOT NULL,
    description text,
    type varchar(20) NOT NULL,
    value numeric(10,2) NOT NULL,
    minimum_amount numeric(10,2) DEFAULT 0,
    maximum_discount numeric(10,2),
    usage_limit integer,
    used_count integer DEFAULT 0,
    is_active boolean DEFAULT true,
    valid_from timestamptz DEFAULT now(),
    valid_until timestamptz,
    created_by uuid,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    CONSTRAINT coupons_type_check CHECK (type IN ('percentage','fixed_amount','free_delivery'))
);

CREATE TABLE public.discounts (
    id uuid DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    name varchar(255) NOT NULL,
    description text,
    type varchar(20) NOT NULL,
    value numeric(10,2) NOT NULL,
    applies_to varchar(50) DEFAULT 'all',
    minimum_amount numeric(10,2) DEFAULT 0,
    maximum_discount numeric(10,2),
    is_active boolean DEFAULT true,
    valid_from timestamptz,
    valid_until timestamptz,
    usage_limit integer,
    used_count integer DEFAULT 0,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    created_by uuid,
    CONSTRAINT discounts_type_check CHECK (type IN ('percentage','fixed_amount','free_shipping'))
);

CREATE TABLE public.taxes (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name varchar(100) NOT NULL,
    description text,
    rate numeric(5,4) NOT NULL,
    type varchar(20) NOT NULL,
    applies_to varchar(50) DEFAULT 'all',
    is_active boolean DEFAULT true,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    CONSTRAINT taxes_rate_check CHECK (rate BETWEEN 0 AND 1),
    CONSTRAINT taxes_type_check CHECK (type IN ('percentage','fixed')),
    CONSTRAINT taxes_applies_to_check CHECK (applies_to IN ('all','products','shipping','total'))
);

CREATE TABLE public.customers (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid,
    full_name text,
    email text,
    phone text,
    source text DEFAULT 'manual',
    notes text,
    created_by uuid,
    last_order_at timestamptz,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE public.payment_methods (
    id uuid DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    name varchar(100) NOT NULL,
    provider varchar(100),
    config jsonb,
    is_active boolean DEFAULT true,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.transactions (
    id uuid DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
    user_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
    transaction_reference varchar(255) NOT NULL,
    payment_method varchar(50) NOT NULL,
    payment_provider varchar(50) DEFAULT 'paystack',
    amount numeric(10,2) NOT NULL,
    currency varchar(10) DEFAULT 'GHS',
    status varchar(50) DEFAULT 'pending',
    paid_at timestamptz,
    metadata jsonb,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    CONSTRAINT transactions_status_check CHECK (status IN ('pending','success','failed','refunded'))
);

CREATE TABLE public.delivery_options (
    id uuid DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    name varchar(100) NOT NULL,
    description text,
    price numeric(10,2) DEFAULT 0,
    estimated_days integer DEFAULT 3,
    is_active boolean DEFAULT true,
    applies_to varchar(50) DEFAULT 'all',
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.deals (
    id uuid DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    title varchar(255) NOT NULL,
    description text,
    discount_percentage integer DEFAULT 0,
    discount_amount numeric(10,2),
    start_date timestamptz,
    end_date timestamptz,
    is_active boolean DEFAULT true,
    is_flash_deal boolean DEFAULT false,
    flash_hour integer,
    flash_day varchar(20),
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    CONSTRAINT deals_discount_percentage_check CHECK (discount_percentage BETWEEN 0 AND 100)
);

CREATE TABLE public.deal_products (
    id uuid DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    deal_id uuid NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
    product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
    deal_price numeric(10,2),
    discount_percentage integer DEFAULT 0,
    sort_order integer DEFAULT 0,
    product_name varchar(255),
    product_description text,
    product_image_url text,
    original_price numeric(10,2),
    product_images text[],
    product_key_features text,
    product_specifications jsonb,
    stock_quantity integer DEFAULT 0,
    created_at timestamptz DEFAULT now(),
    is_flash_deal boolean DEFAULT false,
    CONSTRAINT deal_products_discount_percentage_check CHECK (discount_percentage BETWEEN 0 AND 100),
    CONSTRAINT deal_products_stock_quantity_check CHECK (stock_quantity >= 0)
);

CREATE TABLE public.reviews (
    id uuid DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
    user_id uuid,
    rating integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
    title varchar(255),
    comment text,
    images text[],
    verified_purchase boolean DEFAULT false,
    helpful_count integer DEFAULT 0,
    is_approved boolean DEFAULT true,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.notifications (
    id uuid DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    user_id uuid,
    title varchar(255) NOT NULL,
    message text NOT NULL,
    type varchar(50) DEFAULT 'general',
    metadata jsonb,
    read_at timestamptz,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.notification_preferences (
    user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
    email_notifications boolean DEFAULT true,
    sms_notifications boolean DEFAULT true,
    push_notifications boolean DEFAULT true,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.wishlists (
    id uuid DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    user_id uuid NOT NULL,
    product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    created_at timestamptz DEFAULT now()
);

CREATE TABLE public.cart_items (
    id uuid DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    user_id uuid,
    product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    quantity integer DEFAULT 1 NOT NULL,
    selected_variants jsonb,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.media_library (
    id uuid DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    url text NOT NULL,
    filename varchar(255) NOT NULL,
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

CREATE TABLE public.mega_menu_items (
    id uuid DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    parent_id uuid REFERENCES public.mega_menu_items(id) ON DELETE SET NULL,
    title varchar(100) NOT NULL,
    type varchar(50),
    link varchar(500),
    icon varchar(100),
    image_url text,
    category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
    brand_id uuid REFERENCES public.brands(id) ON DELETE SET NULL,
    column_number integer DEFAULT 1,
    "order" integer DEFAULT 0,
    show_badge boolean DEFAULT false,
    badge_text varchar(50),
    badge_color varchar(50),
    active boolean DEFAULT true,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    CONSTRAINT mega_menu_items_type_check CHECK (type IN ('category','brand','link','banner'))
);

CREATE TABLE public.promotions (
    id uuid DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    title varchar(255) NOT NULL,
    description text,
    banner_image_url text,
    link varchar(500),
    type varchar(50),
    target_page varchar(100),
    start_date timestamptz,
    end_date timestamptz,
    active boolean DEFAULT true,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    CONSTRAINT promotions_type_check CHECK (type IN ('banner','popup','badge'))
);

CREATE TABLE public.settings (
    id uuid DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    key varchar(100) NOT NULL,
    value text,
    category varchar(50) NOT NULL,
    description text,
    updated_at timestamptz DEFAULT now(),
    updated_by uuid
);

CREATE TABLE public.sidebar_ads (
    id uuid DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    title varchar(255),
    image_url text NOT NULL,
    link varchar(500) NOT NULL,
    position varchar(10) DEFAULT 'right',
    show_on jsonb DEFAULT '["homepage"]'::jsonb,
    slider_group uuid,
    active boolean DEFAULT true,
    sort_order integer DEFAULT 0,
    click_count integer DEFAULT 0,
    impression_count integer DEFAULT 0,
    created_by uuid,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    CONSTRAINT sidebar_ads_position_check CHECK (position IN ('left','right'))
);

CREATE TABLE public.activities (
    id uuid DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    action varchar(100) NOT NULL,
    metadata jsonb,
    created_at timestamptz DEFAULT now()
);

CREATE TABLE public.activity_logs (
    id uuid DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
    activity_type varchar(50) NOT NULL,
    description text,
    context jsonb,
    ip_address inet,
    user_agent text,
    created_at timestamptz DEFAULT now()
);

-- Triggers
CREATE TRIGGER update_customers_updated_at
    BEFORE UPDATE ON public.customers
    FOR EACH ROW
    EXECUTE FUNCTION public.set_customers_updated_at();

CREATE TRIGGER update_deals_updated_at
    BEFORE UPDATE ON public.deals
    FOR EACH ROW
    EXECUTE FUNCTION public.update_deals_updated_at();

CREATE TRIGGER update_delivery_options_updated_at
    BEFORE UPDATE ON public.delivery_options
    FOR EACH ROW
    EXECUTE FUNCTION public.update_delivery_options_updated_at();

CREATE TRIGGER update_notifications_updated_at
    BEFORE UPDATE ON public.notifications
    FOR EACH ROW
    EXECUTE FUNCTION public.update_notifications_updated_at();

CREATE TRIGGER update_product_rating_trigger
    AFTER INSERT OR UPDATE OR DELETE ON public.reviews
    FOR EACH ROW
    EXECUTE FUNCTION public.update_product_rating();

CREATE TRIGGER update_settings_updated_at
    BEFORE UPDATE ON public.settings
    FOR EACH ROW
    EXECUTE FUNCTION public.update_settings_timestamp();

CREATE TRIGGER update_variant_stock_updated_at
    BEFORE UPDATE ON public.product_variant_stock
    FOR EACH ROW
    EXECUTE FUNCTION public.update_variant_stock_updated_at();

-- Indexes
CREATE INDEX idx_products_category ON public.products(category_id);
CREATE INDEX idx_products_brand ON public.products(brand_id);
CREATE INDEX idx_products_slug ON public.products(slug);
CREATE INDEX idx_orders_user ON public.orders(user_id);
CREATE INDEX idx_orders_customer ON public.orders(customer_id);
CREATE INDEX idx_order_items_order ON public.order_items(order_id);
CREATE INDEX idx_reviews_product ON public.reviews(product_id);
CREATE INDEX idx_cart_items_user ON public.cart_items(user_id);
CREATE INDEX idx_wishlists_user ON public.wishlists(user_id);

-- Row Level Security
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cart_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wishlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Public can view products"
    ON public.products FOR SELECT
    USING (true);

CREATE POLICY "Users can view own orders"
    ON public.orders FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can view own cart"
    ON public.cart_items FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own cart"
    ON public.cart_items
    USING (auth.uid() = user_id);

CREATE POLICY "Users can view own wishlist"
    ON public.wishlists FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Service role all access"
    ON public.users TO service_role
    USING (true)
    WITH CHECK (true);

-- Grants
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO anon;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO service_role;

