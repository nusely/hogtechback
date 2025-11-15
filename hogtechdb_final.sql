CREATE OR REPLACE FUNCTION "public"."calculate_discount"("amount" numeric, "discount_type" character varying DEFAULT 'all'::character varying) RETURNS numeric
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  total_discount DECIMAL(10,2) := 0;
  discount_record RECORD;
BEGIN
  -- Get all active discounts that apply to the specified type
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
      -- This would be handled separately in shipping calculation
      total_discount := total_discount;
    END IF;
  END LOOP;
  
  RETURN ROUND(LEAST(total_discount, amount), 2);
END;
$$;
CREATE OR REPLACE FUNCTION "public"."calculate_tax"("amount" numeric, "tax_type" character varying DEFAULT 'all'::character varying) RETURNS numeric
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  total_tax DECIMAL(10,2) := 0;
  tax_record RECORD;
BEGIN
  -- Get all active taxes that apply to the specified type
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
CREATE OR REPLACE FUNCTION "public"."generate_coupon_code"() RETURNS "text"
    LANGUAGE "plpgsql"
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
CREATE OR REPLACE FUNCTION "public"."generate_order_number"() RETURNS "text"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  new_order_number TEXT;
BEGIN
  new_order_number := 'HT' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(nextval('order_number_seq')::TEXT, 5, '0');
  RETURN new_order_number;
END;
$$;
CREATE OR REPLACE FUNCTION "public"."get_product_with_variants"("product_slug" "text") RETURNS json
    LANGUAGE "plpgsql"
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
CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  first_name_val VARCHAR(255);
  last_name_val VARCHAR(255);
  full_name_val VARCHAR(255);
BEGIN
  -- Extract first_name and last_name from user_metadata
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
  
  -- Build full_name from first_name and last_name
  full_name_val := TRIM(CONCAT(first_name_val, ' ', last_name_val));
  
  -- Fallback to email if full_name is empty
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
    NULLIF(first_name_val, ''),
    NULLIF(last_name_val, ''),
    NULLIF(full_name_val, ''),
    COALESCE(NEW.raw_user_meta_data->>'phone', NEW.phone, NULL),
    'customer'
  )
  ON CONFLICT (id) DO UPDATE SET
    first_name = COALESCE(EXCLUDED.first_name, users.first_name),
    last_name = COALESCE(EXCLUDED.last_name, users.last_name),
    full_name = COALESCE(EXCLUDED.full_name, users.full_name),
    email = COALESCE(EXCLUDED.email, users.email),
    phone = COALESCE(EXCLUDED.phone, users.phone),
    updated_at = NOW();
  
  RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION "public"."is_admin"("user_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 
    FROM users 
    WHERE id = user_id 
    AND role = 'admin'
  );
END;
$$;
CREATE OR REPLACE FUNCTION "public"."set_customers_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION "public"."update_deals_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION "public"."update_delivery_options_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION "public"."update_notifications_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION "public"."update_product_rating"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- Update the product's rating and rating_count
  UPDATE products 
  SET 
    rating = (
      SELECT COALESCE(AVG(rating), 0) 
      FROM reviews 
      WHERE product_id = COALESCE(NEW.product_id, OLD.product_id)
      AND is_approved = TRUE
    ),
    rating_count = (
      SELECT COUNT(*) 
      FROM reviews 
      WHERE product_id = COALESCE(NEW.product_id, OLD.product_id)
      AND is_approved = TRUE
    ),
    reviews_count = (
      SELECT COUNT(*) 
      FROM reviews 
      WHERE product_id = COALESCE(NEW.product_id, OLD.product_id)
      AND is_approved = TRUE
    )
  WHERE id = COALESCE(NEW.product_id, OLD.product_id);
  
  RETURN COALESCE(NEW, OLD);
END;
$$;
CREATE OR REPLACE FUNCTION "public"."update_settings_timestamp"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION "public"."update_variant_stock_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION "public"."validate_coupon"("coupon_code" "text", "cart_amount" numeric DEFAULT 0) RETURNS TABLE("is_valid" boolean, "discount_amount" numeric, "error_message" "text")
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  coupon_record coupons%ROWTYPE;
  calculated_discount DECIMAL(10, 2) := 0;
  is_valid BOOLEAN := FALSE;
  error_msg TEXT := '';
BEGIN
  -- Get coupon details
  SELECT * INTO coupon_record
  FROM coupons
  WHERE code = coupon_code
  AND is_active = TRUE
  AND (valid_from IS NULL OR valid_from <= NOW())
  AND (valid_until IS NULL OR valid_until >= NOW());

  -- Check if coupon exists
  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 0::DECIMAL(10, 2), 'Coupon not found or expired'::TEXT;
    RETURN;
  END IF;

  -- Check if usage limit exceeded
  IF coupon_record.usage_limit IS NOT NULL AND coupon_record.used_count >= coupon_record.usage_limit THEN
    RETURN QUERY SELECT FALSE, 0::DECIMAL(10, 2), 'Coupon usage limit exceeded'::TEXT;
    RETURN;
  END IF;

  -- Check minimum amount requirement
  IF cart_amount < coupon_record.minimum_amount THEN
    RETURN QUERY SELECT FALSE, 0::DECIMAL(10, 2), 
      'Minimum order amount not met. Required: GHS ' || coupon_record.minimum_amount::TEXT;
    RETURN;
  END IF;

  -- Calculate discount
  CASE coupon_record.type
    WHEN 'percentage' THEN
      calculated_discount := (cart_amount * coupon_record.value) / 100;
      -- Apply maximum discount limit if set
      IF coupon_record.maximum_discount IS NOT NULL AND calculated_discount > coupon_record.maximum_discount THEN
        calculated_discount := coupon_record.maximum_discount;
      END IF;
    WHEN 'fixed_amount' THEN
      calculated_discount := LEAST(coupon_record.value, cart_amount);
    WHEN 'free_delivery' THEN
      calculated_discount := 0; -- Free delivery doesn't reduce cart total
  END CASE;

  is_valid := TRUE;
  RETURN QUERY SELECT is_valid, calculated_discount, ''::TEXT;
END;
$$;
CREATE TABLE IF NOT EXISTS "public"."admin_logs" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "action" "text" NOT NULL,
    "user_id" "uuid",
    "role" "text",
    "status_code" integer,
    "duration_ms" integer,
    "ip_address" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "metadata" "jsonb"
)
CREATE TABLE IF NOT EXISTS "public"."banners" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "title" character varying(255) NOT NULL,
    "subtitle" "text",
    "image_url" "text" NOT NULL,
    "link" character varying(500),
    "button_text" character varying(50),
    "active" boolean DEFAULT true,
    "order" integer DEFAULT 0,
    "start_date" timestamp with time zone,
    "end_date" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
)
CREATE TABLE IF NOT EXISTS "public"."brands" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" character varying(100) NOT NULL,
    "slug" character varying(100) NOT NULL,
    "logo_url" "text",
    "description" "text",
    "website" character varying(255),
    "show_in_mega_menu" boolean DEFAULT false,
    "product_count" integer DEFAULT 0,
    "order" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
)
CREATE TABLE IF NOT EXISTS "public"."cart_items" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid",
    "product_id" "uuid",
    "quantity" integer DEFAULT 1 NOT NULL,
    "selected_variants" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
)
CREATE TABLE IF NOT EXISTS "public"."categories" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" character varying(100) NOT NULL,
    "slug" character varying(100) NOT NULL,
    "description" "text",
    "image_url" "text",
    "parent_id" "uuid",
    "show_in_mega_menu" boolean DEFAULT false,
    "mega_menu_column" character varying(50),
    "order" integer DEFAULT 0,
    "product_count" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
)
CREATE TABLE IF NOT EXISTS "public"."coupons" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" character varying(8) NOT NULL,
    "name" character varying(255) NOT NULL,
    "description" "text",
    "type" character varying(20) NOT NULL,
    "value" numeric(10,2) NOT NULL,
    "minimum_amount" numeric(10,2) DEFAULT 0,
    "maximum_discount" numeric(10,2),
    "usage_limit" integer,
    "used_count" integer DEFAULT 0,
    "is_active" boolean DEFAULT true,
    "valid_from" timestamp with time zone DEFAULT "now"(),
    "valid_until" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid",
    CONSTRAINT "coupons_type_check" CHECK ((("type")::"text" = ANY ((ARRAY['percentage'::character varying, 'fixed_amount'::character varying, 'free_delivery'::character varying])::"text"[])))
)
CREATE TABLE IF NOT EXISTS "public"."customers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "full_name" "text",
    "email" "text",
    "phone" "text",
    "source" "text" DEFAULT 'manual'::"text",
    "notes" "text",
    "created_by" "uuid",
    "last_order_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
)
CREATE TABLE IF NOT EXISTS "public"."deal_products" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "deal_id" "uuid" NOT NULL,
    "product_id" "uuid",
    "deal_price" numeric(10,2),
    "discount_percentage" integer DEFAULT 0,
    "sort_order" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "is_flash_deal" boolean DEFAULT false,
    "product_name" character varying(255),
    "product_description" "text",
    "product_image_url" "text",
    "original_price" numeric(10,2),
    "product_images" "text"[],
    "product_key_features" "text",
    "product_specifications" "jsonb",
    "stock_quantity" integer DEFAULT 0,
    CONSTRAINT "deal_products_discount_percentage_check" CHECK ((("discount_percentage" >= 0) AND ("discount_percentage" <= 100))),
    CONSTRAINT "deal_products_product_check" CHECK ((("product_id" IS NOT NULL) OR (("product_name" IS NOT NULL) AND ("original_price" IS NOT NULL)))),
    CONSTRAINT "deal_products_stock_quantity_check" CHECK (("stock_quantity" >= 0))
)
CREATE TABLE IF NOT EXISTS "public"."deals" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "title" character varying(255) NOT NULL,
    "description" "text",
    "banner_image_url" "text",
    "discount_percentage" integer DEFAULT 0,
    "start_date" timestamp with time zone NOT NULL,
    "end_date" timestamp with time zone NOT NULL,
    "is_active" boolean DEFAULT true,
    "display_order" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "is_flash_deal" boolean DEFAULT false,
    CONSTRAINT "deals_discount_percentage_check" CHECK ((("discount_percentage" >= 0) AND ("discount_percentage" <= 100))),
    CONSTRAINT "valid_date_range" CHECK (("end_date" > "start_date"))
)
CREATE TABLE IF NOT EXISTS "public"."delivery_options" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" character varying(255) NOT NULL,
    "description" "text",
    "price" numeric(10,2) DEFAULT 0 NOT NULL,
    "estimated_days" integer,
    "is_active" boolean DEFAULT true,
    "display_order" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "type" character varying(20) DEFAULT 'delivery'::character varying,
    CONSTRAINT "delivery_options_type_check" CHECK ((("type")::"text" = ANY ((ARRAY['delivery'::character varying, 'pickup'::character varying])::"text"[])))
)
CREATE TABLE IF NOT EXISTS "public"."discounts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" character varying(100) NOT NULL,
    "description" "text",
    "type" character varying(20) NOT NULL,
    "value" numeric(10,2) NOT NULL,
    "minimum_amount" numeric(10,2) DEFAULT 0,
    "maximum_discount" numeric(10,2),
    "is_active" boolean DEFAULT true,
    "valid_from" timestamp with time zone DEFAULT "now"(),
    "valid_until" timestamp with time zone,
    "usage_limit" integer,
    "used_count" integer DEFAULT 0,
    "applies_to" character varying(50) DEFAULT 'all'::character varying,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "discounts_applies_to_check" CHECK ((("applies_to")::"text" = ANY ((ARRAY['all'::character varying, 'products'::character varying, 'shipping'::character varying, 'total'::character varying])::"text"[]))),
    CONSTRAINT "discounts_type_check" CHECK ((("type")::"text" = ANY ((ARRAY['percentage'::character varying, 'fixed_amount'::character varying, 'free_shipping'::character varying])::"text"[])))
)
CREATE TABLE IF NOT EXISTS "public"."media_library" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "url" "text" NOT NULL,
    "filename" character varying(255) NOT NULL,
    "folder" character varying(100) NOT NULL,
    "size" bigint NOT NULL,
    "mime_type" character varying(100) NOT NULL,
    "file_hash" character varying(64),
    "width" integer,
    "height" integer,
    "alt_text" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
)
CREATE TABLE IF NOT EXISTS "public"."mega_menu_items" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "parent_id" "uuid",
    "title" character varying(100) NOT NULL,
    "type" character varying(50),
    "link" character varying(500),
    "icon" character varying(100),
    "image_url" "text",
    "category_id" "uuid",
    "brand_id" "uuid",
    "column_number" integer DEFAULT 1,
    "order" integer DEFAULT 0,
    "show_badge" boolean DEFAULT false,
    "badge_text" character varying(50),
    "badge_color" character varying(50),
    "active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "mega_menu_items_type_check" CHECK ((("type")::"text" = ANY ((ARRAY['category'::character varying, 'brand'::character varying, 'link'::character varying, 'banner'::character varying])::"text"[])))
)
CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "type" character varying(50) NOT NULL,
    "title" character varying(255) NOT NULL,
    "message" "text" NOT NULL,
    "is_read" boolean DEFAULT false,
    "action_url" character varying(500),
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "notifications_type_check" CHECK ((("type")::"text" = ANY ((ARRAY['order'::character varying, 'stock'::character varying, 'user'::character varying, 'alert'::character varying, 'success'::character varying, 'payment'::character varying, 'review'::character varying])::"text"[])))
)
CREATE TABLE IF NOT EXISTS "public"."order_items" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "order_id" "uuid",
    "product_id" "uuid",
    "product_name" character varying(255) NOT NULL,
    "product_image" "text",
    "selected_variants" "jsonb",
    "quantity" integer NOT NULL,
    "unit_price" numeric(10,2) NOT NULL,
    "total_price" numeric(10,2) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "deal_product_id" "uuid",
    "deal_snapshot" "jsonb"
)
CREATE SEQUENCE IF NOT EXISTS "public"."order_number_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
ALTER SEQUENCE "public"."order_number_seq" OWNER TO "postgres"
CREATE TABLE IF NOT EXISTS "public"."orders" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid",
    "order_number" character varying(50) NOT NULL,
    "status" character varying(50) DEFAULT 'pending'::character varying,
    "subtotal" numeric(10,2) NOT NULL,
    "discount" numeric(10,2) DEFAULT 0,
    "tax" numeric(10,2) DEFAULT 0,
    "shipping_fee" numeric(10,2) DEFAULT 0,
    "total" numeric(10,2) NOT NULL,
    "payment_method" character varying(50),
    "payment_status" character varying(50) DEFAULT 'pending'::character varying,
    "shipping_address" "jsonb" NOT NULL,
    "billing_address" "jsonb",
    "tracking_number" character varying(100),
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "discount_code" "text",
    "customer_id" "uuid",
    CONSTRAINT "orders_payment_status_check" CHECK ((("payment_status")::"text" = ANY ((ARRAY['pending'::character varying, 'paid'::character varying, 'failed'::character varying, 'refunded'::character varying])::"text"[]))),
    CONSTRAINT "orders_status_check" CHECK ((("status")::"text" = ANY ((ARRAY['pending'::character varying, 'processing'::character varying, 'shipped'::character varying, 'delivered'::character varying, 'cancelled'::character varying])::"text"[])))
)
CREATE TABLE IF NOT EXISTS "public"."product_attribute_mappings" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "product_id" "uuid",
    "attribute_id" "uuid",
    "is_required" boolean DEFAULT true,
    "display_order" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"()
)
CREATE TABLE IF NOT EXISTS "public"."product_attribute_option_mappings" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "product_id" "uuid" NOT NULL,
    "attribute_id" "uuid" NOT NULL,
    "option_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "stock_quantity" integer DEFAULT 0,
    "is_available" boolean DEFAULT true
)
CREATE TABLE IF NOT EXISTS "public"."product_attribute_options" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "attribute_id" "uuid",
    "value" character varying(100) NOT NULL,
    "label" character varying(100) NOT NULL,
    "price_modifier" numeric(10,2) DEFAULT 0,
    "stock_quantity" integer DEFAULT 0,
    "sku_suffix" character varying(50),
    "display_order" integer DEFAULT 0,
    "is_available" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"()
)
CREATE TABLE IF NOT EXISTS "public"."product_attributes" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" character varying(100) NOT NULL,
    "slug" character varying(100) NOT NULL,
    "type" character varying(50) NOT NULL,
    "display_order" integer DEFAULT 0,
    "is_required" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"()
)
CREATE TABLE IF NOT EXISTS "public"."product_brands" (
    "product_id" "uuid" NOT NULL,
    "brand_id" "uuid" NOT NULL
)
CREATE TABLE IF NOT EXISTS "public"."product_variant_stock" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "product_id" "uuid" NOT NULL,
    "variant_combination" "jsonb" NOT NULL,
    "stock_quantity" integer DEFAULT 0 NOT NULL,
    "sku" character varying(100),
    "is_available" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
)
CREATE TABLE IF NOT EXISTS "public"."product_variants" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "product_id" "uuid",
    "type" character varying(50) NOT NULL,
    "value" character varying(100) NOT NULL,
    "label" character varying(100) NOT NULL,
    "price_adjustment" numeric(10,2) DEFAULT 0,
    "in_stock" boolean DEFAULT true,
    "order" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"()
)
CREATE TABLE IF NOT EXISTS "public"."products" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" character varying(255) NOT NULL,
    "slug" character varying(255) NOT NULL,
    "description" "text",
    "category_id" "uuid",
    "brand_id" "uuid",
    "price" numeric(10,2) NOT NULL,
    "discount_price" numeric(10,2),
    "discount_percentage" integer,
    "in_stock" boolean DEFAULT true,
    "stock_quantity" integer DEFAULT 0,
    "images" "text"[],
    "thumbnail" "text",
    "is_featured" boolean DEFAULT false,
    "rating" numeric(3,2) DEFAULT 0.0,
    "review_count" integer DEFAULT 0,
    "specs" "jsonb",
    "features" "text"[],
    "sku" character varying(100),
    "weight" numeric(10,2),
    "dimensions" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "rating_count" integer DEFAULT 0,
    "reviews_count" integer DEFAULT 0,
    "is_flash_deal" boolean DEFAULT false,
    "flash_deal_start" timestamp with time zone,
    "flash_deal_end" timestamp with time zone,
    "flash_deal_discount" integer DEFAULT 0,
    "flash_deal_price" numeric(10,2),
    "key_features" "text",
    "specifications" "text"
)
CREATE TABLE IF NOT EXISTS "public"."promotions" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "title" character varying(255) NOT NULL,
    "description" "text",
    "banner_image_url" "text",
    "link" character varying(500),
    "type" character varying(50),
    "target_page" character varying(100),
    "start_date" timestamp with time zone,
    "end_date" timestamp with time zone,
    "active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "promotions_type_check" CHECK ((("type")::"text" = ANY ((ARRAY['banner'::character varying, 'popup'::character varying, 'badge'::character varying])::"text"[])))
)
CREATE TABLE IF NOT EXISTS "public"."reviews" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "product_id" "uuid",
    "user_id" "uuid",
    "rating" integer NOT NULL,
    "title" character varying(255),
    "comment" "text",
    "images" "text"[],
    "verified_purchase" boolean DEFAULT false,
    "helpful_count" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "is_approved" boolean DEFAULT true,
    "is_verified_purchase" boolean DEFAULT false,
    CONSTRAINT "reviews_rating_check" CHECK ((("rating" >= 1) AND ("rating" <= 5)))
)
CREATE TABLE IF NOT EXISTS "public"."settings" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "key" character varying(100) NOT NULL,
    "value" "text",
    "category" character varying(50) NOT NULL,
    "description" "text",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "updated_by" "uuid"
)
CREATE TABLE IF NOT EXISTS "public"."sidebar_ads" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "title" character varying(255),
    "image_url" "text" NOT NULL,
    "link" character varying(500) NOT NULL,
    "position" character varying(10) DEFAULT 'right'::character varying,
    "show_on" "jsonb" DEFAULT '["homepage"]'::"jsonb",
    "slider_group" "uuid",
    "active" boolean DEFAULT true,
    "sort_order" integer DEFAULT 0,
    "click_count" integer DEFAULT 0,
    "impression_count" integer DEFAULT 0,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "sidebar_ads_position_check" CHECK ((("position")::"text" = ANY ((ARRAY['left'::character varying, 'right'::character varying])::"text"[])))
)
CREATE TABLE IF NOT EXISTS "public"."taxes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" character varying(100) NOT NULL,
    "description" "text",
    "rate" numeric(5,4) NOT NULL,
    "type" character varying(20) NOT NULL,
    "is_active" boolean DEFAULT true,
    "applies_to" character varying(50) DEFAULT 'all'::character varying,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "taxes_applies_to_check" CHECK ((("applies_to")::"text" = ANY ((ARRAY['all'::character varying, 'products'::character varying, 'shipping'::character varying, 'total'::character varying])::"text"[]))),
    CONSTRAINT "taxes_rate_check" CHECK ((("rate" >= (0)::numeric) AND ("rate" <= (1)::numeric))),
    CONSTRAINT "taxes_type_check" CHECK ((("type")::"text" = ANY ((ARRAY['percentage'::character varying, 'fixed'::character varying])::"text"[])))
)
CREATE TABLE IF NOT EXISTS "public"."transactions" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "order_id" "uuid",
    "user_id" "uuid",
    "transaction_reference" character varying(255) NOT NULL,
    "payment_method" character varying(50) NOT NULL,
    "payment_provider" character varying(50) DEFAULT 'paystack'::character varying,
    "amount" numeric(10,2) NOT NULL,
    "currency" character varying(3) DEFAULT 'GHS'::character varying,
    "status" character varying(50) DEFAULT 'pending'::character varying,
    "payment_status" character varying(50) DEFAULT 'pending'::character varying,
    "paystack_reference" character varying(255),
    "authorization_code" character varying(255),
    "channel" character varying(50),
    "customer_email" character varying(255) NOT NULL,
    "customer_code" character varying(255),
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "initiated_at" timestamp with time zone DEFAULT "now"(),
    "paid_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "transactions_payment_method_check" CHECK ((("payment_method")::"text" = ANY ((ARRAY['paystack'::character varying, 'cash_on_delivery'::character varying, 'mobile_money'::character varying, 'card'::character varying])::"text"[]))),
    CONSTRAINT "transactions_payment_status_check" CHECK ((("payment_status")::"text" = ANY ((ARRAY['pending'::character varying, 'paid'::character varying, 'failed'::character varying, 'refunded'::character varying])::"text"[]))),
    CONSTRAINT "transactions_status_check" CHECK ((("status")::"text" = ANY ((ARRAY['pending'::character varying, 'success'::character varying, 'failed'::character varying, 'cancelled'::character varying, 'refunded'::character varying])::"text"[])))
)
CREATE TABLE IF NOT EXISTS "public"."users" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "email" character varying(255) NOT NULL,
    "phone" character varying(20),
    "avatar_url" "text",
    "role" character varying(20) DEFAULT 'customer'::character varying,
    "email_verified" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "first_name" character varying(255),
    "last_name" character varying(255),
    "shipping_address" "jsonb" DEFAULT '{}'::"jsonb",
    "billing_address" "jsonb" DEFAULT '{}'::"jsonb",
    "date_of_birth" "date",
    "gender" character varying(20),
    "newsletter_subscribed" boolean DEFAULT false,
    "sms_notifications" boolean DEFAULT true,
    "email_notifications" boolean DEFAULT true,
    "full_name" character varying(255),
    CONSTRAINT "users_role_check" CHECK ((("role")::"text" = ANY ((ARRAY['customer'::character varying, 'admin'::character varying, 'superadmin'::character varying])::"text"[])))
)
CREATE TABLE IF NOT EXISTS "public"."wishlists" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid",
    "product_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
)
ALTER TABLE ONLY "public"."admin_logs"
    ADD CONSTRAINT "admin_logs_pkey" PRIMARY KEY ("id")
ALTER TABLE ONLY "public"."banners"
    ADD CONSTRAINT "banners_pkey" PRIMARY KEY ("id")
ALTER TABLE ONLY "public"."brands"
    ADD CONSTRAINT "brands_pkey" PRIMARY KEY ("id")
ALTER TABLE ONLY "public"."brands"
    ADD CONSTRAINT "brands_slug_key" UNIQUE ("slug")
ALTER TABLE ONLY "public"."cart_items"
    ADD CONSTRAINT "cart_items_pkey" PRIMARY KEY ("id")
ALTER TABLE ONLY "public"."cart_items"
    ADD CONSTRAINT "cart_items_user_id_product_id_key" UNIQUE ("user_id", "product_id")
ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_slug_key" UNIQUE ("slug")
ALTER TABLE ONLY "public"."coupons"
    ADD CONSTRAINT "coupons_code_key" UNIQUE ("code")
ALTER TABLE ONLY "public"."coupons"
    ADD CONSTRAINT "coupons_pkey" PRIMARY KEY ("id")
ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "customers_email_key" UNIQUE ("email")
ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
ALTER TABLE ONLY "public"."deal_products"
    ADD CONSTRAINT "deal_products_pkey" PRIMARY KEY ("id")
ALTER TABLE ONLY "public"."deals"
    ADD CONSTRAINT "deals_pkey" PRIMARY KEY ("id")
ALTER TABLE ONLY "public"."delivery_options"
    ADD CONSTRAINT "delivery_options_pkey" PRIMARY KEY ("id")
ALTER TABLE ONLY "public"."discounts"
    ADD CONSTRAINT "discounts_pkey" PRIMARY KEY ("id")
ALTER TABLE ONLY "public"."media_library"
    ADD CONSTRAINT "media_library_file_hash_key" UNIQUE ("file_hash")
ALTER TABLE ONLY "public"."media_library"
    ADD CONSTRAINT "media_library_pkey" PRIMARY KEY ("id")
ALTER TABLE ONLY "public"."media_library"
    ADD CONSTRAINT "media_library_url_key" UNIQUE ("url")
ALTER TABLE ONLY "public"."mega_menu_items"
    ADD CONSTRAINT "mega_menu_items_pkey" PRIMARY KEY ("id")
ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_order_number_key" UNIQUE ("order_number")
ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
ALTER TABLE ONLY "public"."product_attribute_mappings"
    ADD CONSTRAINT "product_attribute_mappings_pkey" PRIMARY KEY ("id")
ALTER TABLE ONLY "public"."product_attribute_mappings"
    ADD CONSTRAINT "product_attribute_mappings_product_id_attribute_id_key" UNIQUE ("product_id", "attribute_id")
ALTER TABLE ONLY "public"."product_attribute_option_mappings"
    ADD CONSTRAINT "product_attribute_option_mapp_product_id_attribute_id_optio_key" UNIQUE ("product_id", "attribute_id", "option_id")
ALTER TABLE ONLY "public"."product_attribute_option_mappings"
    ADD CONSTRAINT "product_attribute_option_mappings_pkey" PRIMARY KEY ("id")
ALTER TABLE ONLY "public"."product_attribute_options"
    ADD CONSTRAINT "product_attribute_options_pkey" PRIMARY KEY ("id")
ALTER TABLE ONLY "public"."product_attributes"
    ADD CONSTRAINT "product_attributes_name_key" UNIQUE ("name")
ALTER TABLE ONLY "public"."product_attributes"
    ADD CONSTRAINT "product_attributes_pkey" PRIMARY KEY ("id")
ALTER TABLE ONLY "public"."product_attributes"
    ADD CONSTRAINT "product_attributes_slug_key" UNIQUE ("slug")
ALTER TABLE ONLY "public"."product_brands"
    ADD CONSTRAINT "product_brands_pkey" PRIMARY KEY ("product_id", "brand_id")
ALTER TABLE ONLY "public"."product_variant_stock"
    ADD CONSTRAINT "product_variant_stock_pkey" PRIMARY KEY ("id")
ALTER TABLE ONLY "public"."product_variant_stock"
    ADD CONSTRAINT "product_variant_stock_product_id_variant_combination_key" UNIQUE ("product_id", "variant_combination")
ALTER TABLE ONLY "public"."product_variants"
    ADD CONSTRAINT "product_variants_pkey" PRIMARY KEY ("id")
ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_pkey" PRIMARY KEY ("id")
ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_sku_key" UNIQUE ("sku")
ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_slug_key" UNIQUE ("slug")
ALTER TABLE ONLY "public"."promotions"
    ADD CONSTRAINT "promotions_pkey" PRIMARY KEY ("id")
ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_product_id_user_id_key" UNIQUE ("product_id", "user_id")
ALTER TABLE ONLY "public"."settings"
    ADD CONSTRAINT "settings_key_key" UNIQUE ("key")
ALTER TABLE ONLY "public"."settings"
    ADD CONSTRAINT "settings_pkey" PRIMARY KEY ("id")
ALTER TABLE ONLY "public"."sidebar_ads"
    ADD CONSTRAINT "sidebar_ads_pkey" PRIMARY KEY ("id")
ALTER TABLE ONLY "public"."taxes"
    ADD CONSTRAINT "taxes_pkey" PRIMARY KEY ("id")
ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_transaction_reference_key" UNIQUE ("transaction_reference")
ALTER TABLE ONLY "public"."delivery_options"
    ADD CONSTRAINT "unique_name" UNIQUE ("name")
ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_email_key" UNIQUE ("email")
ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id")
ALTER TABLE ONLY "public"."wishlists"
    ADD CONSTRAINT "wishlists_pkey" PRIMARY KEY ("id")
ALTER TABLE ONLY "public"."wishlists"
    ADD CONSTRAINT "wishlists_user_id_product_id_key" UNIQUE ("user_id", "product_id")
CREATE INDEX "admin_logs_created_at_idx" ON "public"."admin_logs" USING "btree" ("created_at" DESC)
CREATE INDEX "admin_logs_user_idx" ON "public"."admin_logs" USING "btree" ("user_id")
CREATE UNIQUE INDEX "deal_products_deal_id_product_id_unique" ON "public"."deal_products" USING "btree" ("deal_id", "product_id") WHERE ("product_id" IS NOT NULL)
CREATE INDEX "idx_banners_active" ON "public"."banners" USING "btree" ("active")
CREATE INDEX "idx_banners_order" ON "public"."banners" USING "btree" ("order")
CREATE INDEX "idx_brands_order" ON "public"."brands" USING "btree" ("order")
CREATE INDEX "idx_brands_slug" ON "public"."brands" USING "btree" ("slug")
CREATE INDEX "idx_cart_product" ON "public"."cart_items" USING "btree" ("product_id")
CREATE INDEX "idx_cart_user" ON "public"."cart_items" USING "btree" ("user_id")
CREATE INDEX "idx_categories_order" ON "public"."categories" USING "btree" ("order")
CREATE INDEX "idx_categories_parent" ON "public"."categories" USING "btree" ("parent_id")
CREATE INDEX "idx_categories_slug" ON "public"."categories" USING "btree" ("slug")
CREATE INDEX "idx_coupons_active" ON "public"."coupons" USING "btree" ("is_active")
CREATE INDEX "idx_coupons_code" ON "public"."coupons" USING "btree" ("code")
CREATE INDEX "idx_deal_products_deal_id" ON "public"."deal_products" USING "btree" ("deal_id")
CREATE INDEX "idx_deal_products_is_flash_deal" ON "public"."deal_products" USING "btree" ("is_flash_deal", "deal_id")
CREATE INDEX "idx_deal_products_product_id" ON "public"."deal_products" USING "btree" ("product_id")
CREATE INDEX "idx_deal_products_sort_order" ON "public"."deal_products" USING "btree" ("deal_id", "sort_order")
CREATE INDEX "idx_deals_active" ON "public"."deals" USING "btree" ("is_active", "start_date", "end_date")
CREATE INDEX "idx_deals_display_order" ON "public"."deals" USING "btree" ("display_order")
CREATE INDEX "idx_deals_is_flash_deal" ON "public"."deals" USING "btree" ("is_flash_deal", "is_active", "start_date", "end_date")
CREATE INDEX "idx_delivery_options_active" ON "public"."delivery_options" USING "btree" ("is_active")
CREATE INDEX "idx_delivery_options_display_order" ON "public"."delivery_options" USING "btree" ("display_order")
CREATE INDEX "idx_discounts_active" ON "public"."discounts" USING "btree" ("is_active")
CREATE INDEX "idx_discounts_type" ON "public"."discounts" USING "btree" ("type")
CREATE INDEX "idx_discounts_valid" ON "public"."discounts" USING "btree" ("valid_from", "valid_until")
CREATE INDEX "idx_media_library_created" ON "public"."media_library" USING "btree" ("created_at" DESC)
CREATE INDEX "idx_media_library_folder" ON "public"."media_library" USING "btree" ("folder")
CREATE INDEX "idx_media_library_hash" ON "public"."media_library" USING "btree" ("file_hash")
CREATE INDEX "idx_media_library_url" ON "public"."media_library" USING "btree" ("url")
CREATE INDEX "idx_mega_menu_active" ON "public"."mega_menu_items" USING "btree" ("active")
CREATE INDEX "idx_mega_menu_order" ON "public"."mega_menu_items" USING "btree" ("order")
CREATE INDEX "idx_mega_menu_parent" ON "public"."mega_menu_items" USING "btree" ("parent_id")
CREATE INDEX "idx_mega_menu_type" ON "public"."mega_menu_items" USING "btree" ("type")
CREATE INDEX "idx_notifications_created_at" ON "public"."notifications" USING "btree" ("created_at" DESC)
CREATE INDEX "idx_notifications_is_read" ON "public"."notifications" USING "btree" ("is_read")
CREATE INDEX "idx_notifications_type" ON "public"."notifications" USING "btree" ("type")
CREATE INDEX "idx_order_items_order" ON "public"."order_items" USING "btree" ("order_id")
CREATE INDEX "idx_order_items_product" ON "public"."order_items" USING "btree" ("product_id")
CREATE INDEX "idx_orders_created" ON "public"."orders" USING "btree" ("created_at")
CREATE INDEX "idx_orders_number" ON "public"."orders" USING "btree" ("order_number")
CREATE INDEX "idx_orders_status" ON "public"."orders" USING "btree" ("status")
CREATE INDEX "idx_orders_user" ON "public"."orders" USING "btree" ("user_id")
CREATE INDEX "idx_product_attribute_mappings_attribute" ON "public"."product_attribute_mappings" USING "btree" ("attribute_id")
CREATE INDEX "idx_product_attribute_mappings_product" ON "public"."product_attribute_mappings" USING "btree" ("product_id")
CREATE INDEX "idx_product_attribute_option_mappings_attribute" ON "public"."product_attribute_option_mappings" USING "btree" ("attribute_id")
CREATE INDEX "idx_product_attribute_option_mappings_composite" ON "public"."product_attribute_option_mappings" USING "btree" ("product_id", "attribute_id")
CREATE INDEX "idx_product_attribute_option_mappings_option" ON "public"."product_attribute_option_mappings" USING "btree" ("option_id")
CREATE INDEX "idx_product_attribute_option_mappings_product" ON "public"."product_attribute_option_mappings" USING "btree" ("product_id")
CREATE INDEX "idx_product_attribute_options_attribute" ON "public"."product_attribute_options" USING "btree" ("attribute_id")
CREATE INDEX "idx_product_attribute_options_available" ON "public"."product_attribute_options" USING "btree" ("is_available")
CREATE INDEX "idx_products_brand" ON "public"."products" USING "btree" ("brand_id")
CREATE INDEX "idx_products_category" ON "public"."products" USING "btree" ("category_id")
CREATE INDEX "idx_products_created" ON "public"."products" USING "btree" ("created_at")
CREATE INDEX "idx_products_featured" ON "public"."products" USING "btree" ("is_featured")
CREATE INDEX "idx_products_flash_deal" ON "public"."products" USING "btree" ("is_flash_deal", "flash_deal_end")
CREATE INDEX "idx_products_price" ON "public"."products" USING "btree" ("price")
CREATE INDEX "idx_products_rating" ON "public"."products" USING "btree" ("rating")
CREATE INDEX "idx_products_slug" ON "public"."products" USING "btree" ("slug")
CREATE INDEX "idx_products_stock" ON "public"."products" USING "btree" ("in_stock")
CREATE INDEX "idx_reviews_created_at" ON "public"."reviews" USING "btree" ("created_at" DESC)
CREATE INDEX "idx_reviews_is_approved" ON "public"."reviews" USING "btree" ("is_approved")
CREATE INDEX "idx_reviews_product" ON "public"."reviews" USING "btree" ("product_id")
CREATE INDEX "idx_reviews_product_id" ON "public"."reviews" USING "btree" ("product_id")
CREATE INDEX "idx_reviews_rating" ON "public"."reviews" USING "btree" ("rating")
CREATE INDEX "idx_reviews_user" ON "public"."reviews" USING "btree" ("user_id")
CREATE INDEX "idx_reviews_user_id" ON "public"."reviews" USING "btree" ("user_id")
CREATE INDEX "idx_sidebar_ads_active" ON "public"."sidebar_ads" USING "btree" ("active")
CREATE INDEX "idx_sidebar_ads_order" ON "public"."sidebar_ads" USING "btree" ("sort_order")
CREATE INDEX "idx_sidebar_ads_position" ON "public"."sidebar_ads" USING "btree" ("position")
CREATE INDEX "idx_taxes_active" ON "public"."taxes" USING "btree" ("is_active")
CREATE INDEX "idx_taxes_type" ON "public"."taxes" USING "btree" ("type")
CREATE INDEX "idx_transactions_created_at" ON "public"."transactions" USING "btree" ("created_at")
CREATE INDEX "idx_transactions_customer_email" ON "public"."transactions" USING "btree" ("customer_email")
CREATE INDEX "idx_transactions_order" ON "public"."transactions" USING "btree" ("order_id")
CREATE INDEX "idx_transactions_paid_at" ON "public"."transactions" USING "btree" ("paid_at")
CREATE INDEX "idx_transactions_payment_method" ON "public"."transactions" USING "btree" ("payment_method")
CREATE INDEX "idx_transactions_payment_status" ON "public"."transactions" USING "btree" ("payment_status")
CREATE INDEX "idx_transactions_paystack_ref" ON "public"."transactions" USING "btree" ("paystack_reference")
CREATE INDEX "idx_transactions_reference" ON "public"."transactions" USING "btree" ("transaction_reference")
CREATE INDEX "idx_transactions_status" ON "public"."transactions" USING "btree" ("status")
CREATE INDEX "idx_transactions_user" ON "public"."transactions" USING "btree" ("user_id")
CREATE INDEX "idx_users_email" ON "public"."users" USING "btree" ("email")
CREATE INDEX "idx_users_gender" ON "public"."users" USING "btree" ("gender")
CREATE INDEX "idx_users_newsletter" ON "public"."users" USING "btree" ("newsletter_subscribed")
CREATE INDEX "idx_users_role" ON "public"."users" USING "btree" ("role")
CREATE INDEX "idx_variant_stock_available" ON "public"."product_variant_stock" USING "btree" ("is_available") WHERE ("is_available" = true)
CREATE INDEX "idx_variant_stock_combination" ON "public"."product_variant_stock" USING "gin" ("variant_combination")
CREATE INDEX "idx_variant_stock_product" ON "public"."product_variant_stock" USING "btree" ("product_id")
CREATE INDEX "idx_variants_product" ON "public"."product_variants" USING "btree" ("product_id")
CREATE INDEX "idx_variants_type" ON "public"."product_variants" USING "btree" ("type")
CREATE INDEX "idx_wishlist_product" ON "public"."wishlists" USING "btree" ("product_id")
CREATE INDEX "idx_wishlist_user" ON "public"."wishlists" USING "btree" ("user_id")
CREATE INDEX "orders_discount_code_idx" ON "public"."orders" USING "btree" ("discount_code")
CREATE OR REPLACE TRIGGER "trg_customers_updated_at" BEFORE UPDATE ON "public"."customers" FOR EACH ROW EXECUTE FUNCTION "public"."set_customers_updated_at"()
CREATE OR REPLACE TRIGGER "trigger_delivery_options_updated_at" BEFORE UPDATE ON "public"."delivery_options" FOR EACH ROW EXECUTE FUNCTION "public"."update_delivery_options_updated_at"()
CREATE OR REPLACE TRIGGER "trigger_update_product_rating_delete" AFTER DELETE ON "public"."reviews" FOR EACH ROW EXECUTE FUNCTION "public"."update_product_rating"()
CREATE OR REPLACE TRIGGER "trigger_update_product_rating_insert" AFTER INSERT ON "public"."reviews" FOR EACH ROW EXECUTE FUNCTION "public"."update_product_rating"()
CREATE OR REPLACE TRIGGER "trigger_update_product_rating_update" AFTER UPDATE ON "public"."reviews" FOR EACH ROW EXECUTE FUNCTION "public"."update_product_rating"()
CREATE OR REPLACE TRIGGER "trigger_update_settings_timestamp" BEFORE UPDATE ON "public"."settings" FOR EACH ROW EXECUTE FUNCTION "public"."update_settings_timestamp"()
CREATE OR REPLACE TRIGGER "update_banners_updated_at" BEFORE UPDATE ON "public"."banners" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"()
CREATE OR REPLACE TRIGGER "update_brands_updated_at" BEFORE UPDATE ON "public"."brands" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"()
CREATE OR REPLACE TRIGGER "update_cart_items_updated_at" BEFORE UPDATE ON "public"."cart_items" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"()
CREATE OR REPLACE TRIGGER "update_categories_updated_at" BEFORE UPDATE ON "public"."categories" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"()
CREATE OR REPLACE TRIGGER "update_deals_timestamp" BEFORE UPDATE ON "public"."deals" FOR EACH ROW EXECUTE FUNCTION "public"."update_deals_updated_at"()
CREATE OR REPLACE TRIGGER "update_mega_menu_items_updated_at" BEFORE UPDATE ON "public"."mega_menu_items" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"()
CREATE OR REPLACE TRIGGER "update_notifications_updated_at" BEFORE UPDATE ON "public"."notifications" FOR EACH ROW EXECUTE FUNCTION "public"."update_notifications_updated_at"()
CREATE OR REPLACE TRIGGER "update_orders_updated_at" BEFORE UPDATE ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"()
CREATE OR REPLACE TRIGGER "update_products_updated_at" BEFORE UPDATE ON "public"."products" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"()
CREATE OR REPLACE TRIGGER "update_promotions_updated_at" BEFORE UPDATE ON "public"."promotions" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"()
CREATE OR REPLACE TRIGGER "update_reviews_updated_at" BEFORE UPDATE ON "public"."reviews" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"()
CREATE OR REPLACE TRIGGER "update_sidebar_ads_updated_at" BEFORE UPDATE ON "public"."sidebar_ads" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"()
CREATE OR REPLACE TRIGGER "update_users_updated_at" BEFORE UPDATE ON "public"."users" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"()
CREATE OR REPLACE TRIGGER "update_variant_stock_timestamp" BEFORE UPDATE ON "public"."product_variant_stock" FOR EACH ROW EXECUTE FUNCTION "public"."update_variant_stock_updated_at"()
ALTER TABLE ONLY "public"."cart_items"
    ADD CONSTRAINT "cart_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE
ALTER TABLE ONLY "public"."cart_items"
    ADD CONSTRAINT "cart_items_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE
ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."categories"("id") ON DELETE SET NULL
ALTER TABLE ONLY "public"."coupons"
    ADD CONSTRAINT "coupons_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id")
ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "customers_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL
ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "customers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL
ALTER TABLE ONLY "public"."deal_products"
    ADD CONSTRAINT "deal_products_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE CASCADE
ALTER TABLE ONLY "public"."deal_products"
    ADD CONSTRAINT "deal_products_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE
ALTER TABLE ONLY "public"."mega_menu_items"
    ADD CONSTRAINT "mega_menu_items_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE SET NULL
ALTER TABLE ONLY "public"."mega_menu_items"
    ADD CONSTRAINT "mega_menu_items_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE SET NULL
ALTER TABLE ONLY "public"."mega_menu_items"
    ADD CONSTRAINT "mega_menu_items_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."mega_menu_items"("id") ON DELETE CASCADE
ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_deal_product_id_fkey" FOREIGN KEY ("deal_product_id") REFERENCES "public"."deal_products"("id")
ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE
ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE SET NULL
ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE SET NULL
ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL
ALTER TABLE ONLY "public"."product_attribute_mappings"
    ADD CONSTRAINT "product_attribute_mappings_attribute_id_fkey" FOREIGN KEY ("attribute_id") REFERENCES "public"."product_attributes"("id") ON DELETE CASCADE
ALTER TABLE ONLY "public"."product_attribute_mappings"
    ADD CONSTRAINT "product_attribute_mappings_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE
ALTER TABLE ONLY "public"."product_attribute_option_mappings"
    ADD CONSTRAINT "product_attribute_option_mappings_attribute_id_fkey" FOREIGN KEY ("attribute_id") REFERENCES "public"."product_attributes"("id") ON DELETE CASCADE
ALTER TABLE ONLY "public"."product_attribute_option_mappings"
    ADD CONSTRAINT "product_attribute_option_mappings_option_id_fkey" FOREIGN KEY ("option_id") REFERENCES "public"."product_attribute_options"("id") ON DELETE CASCADE
ALTER TABLE ONLY "public"."product_attribute_option_mappings"
    ADD CONSTRAINT "product_attribute_option_mappings_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE
ALTER TABLE ONLY "public"."product_attribute_options"
    ADD CONSTRAINT "product_attribute_options_attribute_id_fkey" FOREIGN KEY ("attribute_id") REFERENCES "public"."product_attributes"("id") ON DELETE CASCADE
ALTER TABLE ONLY "public"."product_brands"
    ADD CONSTRAINT "product_brands_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE CASCADE
ALTER TABLE ONLY "public"."product_brands"
    ADD CONSTRAINT "product_brands_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE
ALTER TABLE ONLY "public"."product_variant_stock"
    ADD CONSTRAINT "product_variant_stock_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE
ALTER TABLE ONLY "public"."product_variants"
    ADD CONSTRAINT "product_variants_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE
ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE SET NULL
ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE SET NULL
ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE
ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE
ALTER TABLE ONLY "public"."settings"
    ADD CONSTRAINT "settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id")
ALTER TABLE ONLY "public"."sidebar_ads"
    ADD CONSTRAINT "sidebar_ads_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL
ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE SET NULL
ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL
ALTER TABLE ONLY "public"."wishlists"
    ADD CONSTRAINT "wishlists_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE
ALTER TABLE ONLY "public"."wishlists"
    ADD CONSTRAINT "wishlists_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE
CREATE POLICY "Admins can delete any review" ON "public"."reviews" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND (("users"."role")::"text" = 'admin'::"text")))))
CREATE POLICY "Admins can delete notifications" ON "public"."notifications" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND (("users"."role")::"text" = 'admin'::"text")))))
CREATE POLICY "Admins can delete orders" ON "public"."orders" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND (("users"."role")::"text" = 'admin'::"text")))))
CREATE POLICY "Admins can manage all reviews" ON "public"."reviews" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND (("users"."role")::"text" = 'admin'::"text")))))
CREATE POLICY "Admins can manage attribute options" ON "public"."product_attribute_options" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND (("users"."role")::"text" = 'admin'::"text")))))
CREATE POLICY "Admins can manage banners" ON "public"."banners" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND (("users"."role")::"text" = 'admin'::"text")))))
CREATE POLICY "Admins can manage brands" ON "public"."brands" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND (("users"."role")::"text" = 'admin'::"text")))))
CREATE POLICY "Admins can manage categories" ON "public"."categories" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND (("users"."role")::"text" = 'admin'::"text")))))
CREATE POLICY "Admins can manage coupons" ON "public"."coupons" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND (("users"."role")::"text" = 'admin'::"text")))))
CREATE POLICY "Admins can manage deal products" ON "public"."deal_products" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND (("users"."role")::"text" = 'admin'::"text")))))
CREATE POLICY "Admins can manage deals" ON "public"."deals" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND (("users"."role")::"text" = 'admin'::"text")))))
CREATE POLICY "Admins can manage delivery options" ON "public"."delivery_options" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND (("users"."role")::"text" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND (("users"."role")::"text" = 'admin'::"text")))))
CREATE POLICY "Admins can manage discounts" ON "public"."discounts" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND (("users"."role")::"text" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND (("users"."role")::"text" = 'admin'::"text")))))
CREATE POLICY "Admins can manage mega menu items" ON "public"."mega_menu_items" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND (("users"."role")::"text" = 'admin'::"text")))))
CREATE POLICY "Admins can manage product attribute mappings" ON "public"."product_attribute_mappings" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND (("users"."role")::"text" = 'admin'::"text")))))
CREATE POLICY "Admins can manage product attribute option mappings" ON "public"."product_attribute_option_mappings" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND (("users"."role")::"text" = 'admin'::"text")))))
CREATE POLICY "Admins can manage product attributes" ON "public"."product_attributes" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND (("users"."role")::"text" = 'admin'::"text")))))
CREATE POLICY "Admins can manage product variants" ON "public"."product_variants" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND (("users"."role")::"text" = 'admin'::"text")))))
CREATE POLICY "Admins can manage products" ON "public"."products" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND (("users"."role")::"text" = 'admin'::"text")))))
CREATE POLICY "Admins can manage promotions" ON "public"."promotions" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND (("users"."role")::"text" = 'admin'::"text")))))
CREATE POLICY "Admins can manage settings" ON "public"."settings" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND (("users"."role")::"text" = 'admin'::"text")))))
CREATE POLICY "Admins can manage sidebar ads" ON "public"."sidebar_ads" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND (("users"."role")::"text" = 'admin'::"text")))))
CREATE POLICY "Admins can manage taxes" ON "public"."taxes" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND (("users"."role")::"text" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND (("users"."role")::"text" = 'admin'::"text")))))
CREATE POLICY "Admins can manage variant stock" ON "public"."product_variant_stock" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND (("users"."role")::"text" = 'admin'::"text")))))
CREATE POLICY "Admins can update all orders" ON "public"."orders" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND (("users"."role")::"text" = 'admin'::"text")))))
CREATE POLICY "Admins can update all users" ON "public"."users" FOR UPDATE USING ((("auth"."uid"() = "id") OR "public"."is_admin"("auth"."uid"())))
CREATE POLICY "Admins can update notifications" ON "public"."notifications" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND (("users"."role")::"text" = 'admin'::"text")))))
CREATE POLICY "Admins can view all banners" ON "public"."banners" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND (("users"."role")::"text" = 'admin'::"text")))))
CREATE POLICY "Admins can view all deal products" ON "public"."deal_products" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND (("users"."role")::"text" = 'admin'::"text")))))
CREATE POLICY "Admins can view all deals" ON "public"."deals" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND (("users"."role")::"text" = 'admin'::"text")))))
CREATE POLICY "Admins can view all notifications" ON "public"."notifications" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND (("users"."role")::"text" = 'admin'::"text")))))
CREATE POLICY "Admins can view all order items" ON "public"."order_items" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND (("users"."role")::"text" = 'admin'::"text")))))
CREATE POLICY "Admins can view all orders" ON "public"."orders" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND (("users"."role")::"text" = 'admin'::"text")))))
CREATE POLICY "Admins can view all reviews" ON "public"."reviews" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND (("users"."role")::"text" = 'admin'::"text")))))
CREATE POLICY "Admins can view all users" ON "public"."users" FOR SELECT USING ((("auth"."uid"() = "id") OR "public"."is_admin"("auth"."uid"())))
CREATE POLICY "Admins can view all wishlists" ON "public"."wishlists" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND (("users"."role")::"text" = 'admin'::"text")))))
CREATE POLICY "Allow authenticated users to delete media" ON "public"."media_library" FOR DELETE TO "authenticated" USING (true)
CREATE POLICY "Allow authenticated users to insert media" ON "public"."media_library" FOR INSERT TO "authenticated" WITH CHECK (true)
CREATE POLICY "Allow authenticated users to read media" ON "public"."media_library" FOR SELECT TO "authenticated" USING (true)
CREATE POLICY "Allow authenticated users to update media" ON "public"."media_library" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true)
CREATE POLICY "Allow order creation" ON "public"."orders" FOR INSERT WITH CHECK (((("user_id" IS NOT NULL) AND ("user_id" = "auth"."uid"())) OR ("user_id" IS NULL) OR ("auth"."uid"() IS NOT NULL)))
CREATE POLICY "Anyone can view active banners" ON "public"."banners" FOR SELECT USING (("active" = true))
CREATE POLICY "Anyone can view active mega menu items" ON "public"."mega_menu_items" FOR SELECT USING (("active" = true))
CREATE POLICY "Anyone can view active promotions" ON "public"."promotions" FOR SELECT USING (("active" = true))
CREATE POLICY "Anyone can view active sidebar ads" ON "public"."sidebar_ads" FOR SELECT USING (("active" = true))
CREATE POLICY "Anyone can view brands" ON "public"."brands" FOR SELECT USING (true)
CREATE POLICY "Anyone can view categories" ON "public"."categories" FOR SELECT USING (true)
CREATE POLICY "Anyone can view product variants" ON "public"."product_variants" FOR SELECT USING (true)
CREATE POLICY "Anyone can view products" ON "public"."products" FOR SELECT USING (true)
CREATE POLICY "Anyone can view reviews" ON "public"."reviews" FOR SELECT USING (true)
CREATE POLICY "Public can view active coupons" ON "public"."coupons" FOR SELECT USING (("is_active" = true))
CREATE POLICY "Public can view active deals" ON "public"."deals" FOR SELECT USING ((("is_active" = true) AND ("start_date" <= "now"()) AND ("end_date" >= "now"())))
CREATE POLICY "Public can view active delivery options" ON "public"."delivery_options" FOR SELECT USING (("is_active" = true))
CREATE POLICY "Public can view active discounts" ON "public"."discounts" FOR SELECT USING ((("is_active" = true) AND ("valid_from" <= "now"()) AND (("valid_until" IS NULL) OR ("valid_until" >= "now"())) AND (("usage_limit" IS NULL) OR ("used_count" < "usage_limit"))))
CREATE POLICY "Public can view active taxes" ON "public"."taxes" FOR SELECT USING (("is_active" = true))
CREATE POLICY "Public can view approved reviews" ON "public"."reviews" FOR SELECT USING (("is_approved" = true))
CREATE POLICY "Public can view attribute options" ON "public"."product_attribute_options" FOR SELECT USING (true)
CREATE POLICY "Public can view available variant stock" ON "public"."product_variant_stock" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM "public"."products"
  WHERE (("products"."id" = "product_variant_stock"."product_id") AND ("products"."in_stock" = true)))) AND ("is_available" = true)))
CREATE POLICY "Public can view deal products" ON "public"."deal_products" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."deals"
  WHERE (("deals"."id" = "deal_products"."deal_id") AND ("deals"."is_active" = true) AND ("deals"."start_date" <= "now"()) AND ("deals"."end_date" >= "now"())))))
CREATE POLICY "Public can view product attribute mappings" ON "public"."product_attribute_mappings" FOR SELECT USING (true)
CREATE POLICY "Public can view product attribute option mappings" ON "public"."product_attribute_option_mappings" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."products"
  WHERE (("products"."id" = "product_attribute_option_mappings"."product_id") AND ("products"."in_stock" = true)))))
CREATE POLICY "Public can view product attributes" ON "public"."product_attributes" FOR SELECT USING (true)
CREATE POLICY "Public can view settings" ON "public"."settings" FOR SELECT USING (true)
CREATE POLICY "Users can create reviews" ON "public"."reviews" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"))
CREATE POLICY "Users can delete own reviews" ON "public"."reviews" FOR DELETE USING (("auth"."uid"() = "user_id"))
CREATE POLICY "Users can delete own wishlist" ON "public"."wishlists" FOR DELETE TO "authenticated" USING (("user_id" = "auth"."uid"()))
CREATE POLICY "Users can delete their own reviews" ON "public"."reviews" FOR DELETE USING (("auth"."uid"() = "user_id"))
CREATE POLICY "Users can insert own wishlist" ON "public"."wishlists" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()))
CREATE POLICY "Users can insert their own order items" ON "public"."order_items" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."orders"
  WHERE (("orders"."id" = "order_items"."order_id") AND ("orders"."user_id" = "auth"."uid"())))))
CREATE POLICY "Users can insert their own reviews" ON "public"."reviews" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"))
CREATE POLICY "Users can manage own cart" ON "public"."cart_items" USING (("auth"."uid"() = "user_id"))
CREATE POLICY "Users can manage own wishlist" ON "public"."wishlists" USING (("auth"."uid"() = "user_id"))
CREATE POLICY "Users can update own orders" ON "public"."orders" FOR UPDATE USING ((("auth"."uid"() = "user_id") OR (EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND (("users"."role")::"text" = 'admin'::"text"))))))
CREATE POLICY "Users can update own reviews" ON "public"."reviews" FOR UPDATE USING (("auth"."uid"() = "user_id"))
CREATE POLICY "Users can update their own reviews" ON "public"."reviews" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"))
CREATE POLICY "Users can view own cart" ON "public"."cart_items" FOR SELECT USING (("auth"."uid"() = "user_id"))
CREATE POLICY "Users can view own order items" ON "public"."order_items" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."orders"
  WHERE (("orders"."id" = "order_items"."order_id") AND ("orders"."user_id" = "auth"."uid"())))))
CREATE POLICY "Users can view own orders" ON "public"."orders" FOR SELECT USING ((("auth"."uid"() = "user_id") OR (EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND (("users"."role")::"text" = 'admin'::"text"))))))
CREATE POLICY "Users can view own wishlist" ON "public"."wishlists" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()))
CREATE POLICY "Users can view their own order items" ON "public"."order_items" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."orders"
  WHERE (("orders"."id" = "order_items"."order_id") AND ("orders"."user_id" = "auth"."uid"())))))
CREATE POLICY "Users can view their own reviews" ON "public"."reviews" FOR SELECT USING (("auth"."uid"() = "user_id"))
ALTER TABLE "public"."banners" ENABLE ROW LEVEL SECURITY
ALTER TABLE "public"."brands" ENABLE ROW LEVEL SECURITY
ALTER TABLE "public"."cart_items" ENABLE ROW LEVEL SECURITY
ALTER TABLE "public"."categories" ENABLE ROW LEVEL SECURITY
ALTER TABLE "public"."coupons" ENABLE ROW LEVEL SECURITY
ALTER TABLE "public"."deal_products" ENABLE ROW LEVEL SECURITY
ALTER TABLE "public"."deals" ENABLE ROW LEVEL SECURITY
ALTER TABLE "public"."delivery_options" ENABLE ROW LEVEL SECURITY
ALTER TABLE "public"."discounts" ENABLE ROW LEVEL SECURITY
ALTER TABLE "public"."media_library" ENABLE ROW LEVEL SECURITY
ALTER TABLE "public"."mega_menu_items" ENABLE ROW LEVEL SECURITY
ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY
ALTER TABLE "public"."order_items" ENABLE ROW LEVEL SECURITY
ALTER TABLE "public"."orders" ENABLE ROW LEVEL SECURITY
ALTER TABLE "public"."product_attribute_mappings" ENABLE ROW LEVEL SECURITY
ALTER TABLE "public"."product_attribute_option_mappings" ENABLE ROW LEVEL SECURITY
ALTER TABLE "public"."product_attribute_options" ENABLE ROW LEVEL SECURITY
ALTER TABLE "public"."product_attributes" ENABLE ROW LEVEL SECURITY
ALTER TABLE "public"."product_variant_stock" ENABLE ROW LEVEL SECURITY
ALTER TABLE "public"."product_variants" ENABLE ROW LEVEL SECURITY
ALTER TABLE "public"."products" ENABLE ROW LEVEL SECURITY
ALTER TABLE "public"."promotions" ENABLE ROW LEVEL SECURITY
ALTER TABLE "public"."reviews" ENABLE ROW LEVEL SECURITY
CREATE POLICY "service_role_all" ON "public"."users" TO "service_role" USING (true) WITH CHECK (true)
CREATE POLICY "service_role_insert" ON "public"."users" FOR INSERT TO "service_role" WITH CHECK (true)
ALTER TABLE "public"."settings" ENABLE ROW LEVEL SECURITY
ALTER TABLE "public"."sidebar_ads" ENABLE ROW LEVEL SECURITY
ALTER TABLE "public"."taxes" ENABLE ROW LEVEL SECURITY
ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY
CREATE POLICY "users_insert_policy" ON "public"."users" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "id"))
CREATE POLICY "users_select_own" ON "public"."users" FOR SELECT TO "authenticated" USING (("id" = "auth"."uid"()))
CREATE POLICY "users_update_own" ON "public"."users" FOR UPDATE TO "authenticated" USING (("id" = "auth"."uid"())) WITH CHECK (("id" = "auth"."uid"()))
ALTER TABLE "public"."wishlists" ENABLE ROW LEVEL SECURITY
GRANT USAGE ON SCHEMA "public" TO "anon"
GRANT USAGE ON SCHEMA "public" TO "authenticated"
GRANT USAGE ON SCHEMA "public" TO "service_role"
GRANT ALL ON FUNCTION "public"."calculate_discount"("amount" numeric, "discount_type" character varying) TO "anon"
GRANT ALL ON FUNCTION "public"."calculate_discount"("amount" numeric, "discount_type" character varying) TO "authenticated"
GRANT ALL ON FUNCTION "public"."calculate_discount"("amount" numeric, "discount_type" character varying) TO "service_role"
GRANT ALL ON FUNCTION "public"."calculate_tax"("amount" numeric, "tax_type" character varying) TO "anon"
GRANT ALL ON FUNCTION "public"."calculate_tax"("amount" numeric, "tax_type" character varying) TO "authenticated"
GRANT ALL ON FUNCTION "public"."calculate_tax"("amount" numeric, "tax_type" character varying) TO "service_role"
GRANT ALL ON FUNCTION "public"."generate_coupon_code"() TO "anon"
GRANT ALL ON FUNCTION "public"."generate_coupon_code"() TO "authenticated"
GRANT ALL ON FUNCTION "public"."generate_coupon_code"() TO "service_role"
GRANT ALL ON FUNCTION "public"."generate_order_number"() TO "anon"
GRANT ALL ON FUNCTION "public"."generate_order_number"() TO "authenticated"
GRANT ALL ON FUNCTION "public"."generate_order_number"() TO "service_role"
GRANT ALL ON FUNCTION "public"."get_product_with_variants"("product_slug" "text") TO "anon"
GRANT ALL ON FUNCTION "public"."get_product_with_variants"("product_slug" "text") TO "authenticated"
GRANT ALL ON FUNCTION "public"."get_product_with_variants"("product_slug" "text") TO "service_role"
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon"
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated"
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role"
GRANT ALL ON FUNCTION "public"."is_admin"("user_id" "uuid") TO "anon"
GRANT ALL ON FUNCTION "public"."is_admin"("user_id" "uuid") TO "authenticated"
GRANT ALL ON FUNCTION "public"."is_admin"("user_id" "uuid") TO "service_role"
GRANT ALL ON FUNCTION "public"."set_customers_updated_at"() TO "anon"
GRANT ALL ON FUNCTION "public"."set_customers_updated_at"() TO "authenticated"
GRANT ALL ON FUNCTION "public"."set_customers_updated_at"() TO "service_role"
GRANT ALL ON FUNCTION "public"."update_deals_updated_at"() TO "anon"
GRANT ALL ON FUNCTION "public"."update_deals_updated_at"() TO "authenticated"
GRANT ALL ON FUNCTION "public"."update_deals_updated_at"() TO "service_role"
GRANT ALL ON FUNCTION "public"."update_delivery_options_updated_at"() TO "anon"
GRANT ALL ON FUNCTION "public"."update_delivery_options_updated_at"() TO "authenticated"
GRANT ALL ON FUNCTION "public"."update_delivery_options_updated_at"() TO "service_role"
GRANT ALL ON FUNCTION "public"."update_notifications_updated_at"() TO "anon"
GRANT ALL ON FUNCTION "public"."update_notifications_updated_at"() TO "authenticated"
GRANT ALL ON FUNCTION "public"."update_notifications_updated_at"() TO "service_role"
GRANT ALL ON FUNCTION "public"."update_product_rating"() TO "anon"
GRANT ALL ON FUNCTION "public"."update_product_rating"() TO "authenticated"
GRANT ALL ON FUNCTION "public"."update_product_rating"() TO "service_role"
GRANT ALL ON FUNCTION "public"."update_settings_timestamp"() TO "anon"
GRANT ALL ON FUNCTION "public"."update_settings_timestamp"() TO "authenticated"
GRANT ALL ON FUNCTION "public"."update_settings_timestamp"() TO "service_role"
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon"
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated"
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role"
GRANT ALL ON FUNCTION "public"."update_variant_stock_updated_at"() TO "anon"
GRANT ALL ON FUNCTION "public"."update_variant_stock_updated_at"() TO "authenticated"
GRANT ALL ON FUNCTION "public"."update_variant_stock_updated_at"() TO "service_role"
GRANT ALL ON FUNCTION "public"."validate_coupon"("coupon_code" "text", "cart_amount" numeric) TO "anon"
GRANT ALL ON FUNCTION "public"."validate_coupon"("coupon_code" "text", "cart_amount" numeric) TO "authenticated"
GRANT ALL ON FUNCTION "public"."validate_coupon"("coupon_code" "text", "cart_amount" numeric) TO "service_role"
GRANT ALL ON TABLE "public"."admin_logs" TO "anon"
GRANT ALL ON TABLE "public"."admin_logs" TO "authenticated"
GRANT ALL ON TABLE "public"."admin_logs" TO "service_role"
GRANT ALL ON TABLE "public"."banners" TO "anon"
GRANT ALL ON TABLE "public"."banners" TO "authenticated"
GRANT ALL ON TABLE "public"."banners" TO "service_role"
GRANT ALL ON TABLE "public"."brands" TO "anon"
GRANT ALL ON TABLE "public"."brands" TO "authenticated"
GRANT ALL ON TABLE "public"."brands" TO "service_role"
GRANT ALL ON TABLE "public"."cart_items" TO "anon"
GRANT ALL ON TABLE "public"."cart_items" TO "authenticated"
GRANT ALL ON TABLE "public"."cart_items" TO "service_role"
GRANT ALL ON TABLE "public"."categories" TO "anon"
GRANT ALL ON TABLE "public"."categories" TO "authenticated"
GRANT ALL ON TABLE "public"."categories" TO "service_role"
GRANT ALL ON TABLE "public"."coupons" TO "anon"
GRANT ALL ON TABLE "public"."coupons" TO "authenticated"
GRANT ALL ON TABLE "public"."coupons" TO "service_role"
GRANT ALL ON TABLE "public"."customers" TO "anon"
GRANT ALL ON TABLE "public"."customers" TO "authenticated"
GRANT ALL ON TABLE "public"."customers" TO "service_role"
GRANT ALL ON TABLE "public"."deal_products" TO "anon"
GRANT ALL ON TABLE "public"."deal_products" TO "authenticated"
GRANT ALL ON TABLE "public"."deal_products" TO "service_role"
GRANT ALL ON TABLE "public"."deals" TO "anon"
GRANT ALL ON TABLE "public"."deals" TO "authenticated"
GRANT ALL ON TABLE "public"."deals" TO "service_role"
GRANT ALL ON TABLE "public"."delivery_options" TO "anon"
GRANT ALL ON TABLE "public"."delivery_options" TO "authenticated"
GRANT ALL ON TABLE "public"."delivery_options" TO "service_role"
GRANT ALL ON TABLE "public"."discounts" TO "anon"
GRANT ALL ON TABLE "public"."discounts" TO "authenticated"
GRANT ALL ON TABLE "public"."discounts" TO "service_role"
GRANT ALL ON TABLE "public"."media_library" TO "anon"
GRANT ALL ON TABLE "public"."media_library" TO "authenticated"
GRANT ALL ON TABLE "public"."media_library" TO "service_role"
GRANT ALL ON TABLE "public"."mega_menu_items" TO "anon"
GRANT ALL ON TABLE "public"."mega_menu_items" TO "authenticated"
GRANT ALL ON TABLE "public"."mega_menu_items" TO "service_role"
GRANT ALL ON TABLE "public"."notifications" TO "anon"
GRANT ALL ON TABLE "public"."notifications" TO "authenticated"
GRANT ALL ON TABLE "public"."notifications" TO "service_role"
GRANT ALL ON TABLE "public"."order_items" TO "anon"
GRANT ALL ON TABLE "public"."order_items" TO "authenticated"
GRANT ALL ON TABLE "public"."order_items" TO "service_role"
GRANT ALL ON SEQUENCE "public"."order_number_seq" TO "anon"
GRANT ALL ON SEQUENCE "public"."order_number_seq" TO "authenticated"
GRANT ALL ON SEQUENCE "public"."order_number_seq" TO "service_role"
GRANT ALL ON TABLE "public"."orders" TO "anon"
GRANT ALL ON TABLE "public"."orders" TO "authenticated"
GRANT ALL ON TABLE "public"."orders" TO "service_role"
GRANT ALL ON TABLE "public"."product_attribute_mappings" TO "anon"
GRANT ALL ON TABLE "public"."product_attribute_mappings" TO "authenticated"
GRANT ALL ON TABLE "public"."product_attribute_mappings" TO "service_role"
GRANT ALL ON TABLE "public"."product_attribute_option_mappings" TO "anon"
GRANT ALL ON TABLE "public"."product_attribute_option_mappings" TO "authenticated"
GRANT ALL ON TABLE "public"."product_attribute_option_mappings" TO "service_role"
GRANT ALL ON TABLE "public"."product_attribute_options" TO "anon"
GRANT ALL ON TABLE "public"."product_attribute_options" TO "authenticated"
GRANT ALL ON TABLE "public"."product_attribute_options" TO "service_role"
GRANT ALL ON TABLE "public"."product_attributes" TO "anon"
GRANT ALL ON TABLE "public"."product_attributes" TO "authenticated"
GRANT ALL ON TABLE "public"."product_attributes" TO "service_role"
GRANT ALL ON TABLE "public"."product_brands" TO "anon"
GRANT ALL ON TABLE "public"."product_brands" TO "authenticated"
GRANT ALL ON TABLE "public"."product_brands" TO "service_role"
GRANT ALL ON TABLE "public"."product_variant_stock" TO "anon"
GRANT ALL ON TABLE "public"."product_variant_stock" TO "authenticated"
GRANT ALL ON TABLE "public"."product_variant_stock" TO "service_role"
GRANT ALL ON TABLE "public"."product_variants" TO "anon"
GRANT ALL ON TABLE "public"."product_variants" TO "authenticated"
GRANT ALL ON TABLE "public"."product_variants" TO "service_role"
GRANT ALL ON TABLE "public"."products" TO "anon"
GRANT ALL ON TABLE "public"."products" TO "authenticated"
GRANT ALL ON TABLE "public"."products" TO "service_role"
GRANT ALL ON TABLE "public"."promotions" TO "anon"
GRANT ALL ON TABLE "public"."promotions" TO "authenticated"
GRANT ALL ON TABLE "public"."promotions" TO "service_role"
GRANT ALL ON TABLE "public"."reviews" TO "anon"
GRANT ALL ON TABLE "public"."reviews" TO "authenticated"
GRANT ALL ON TABLE "public"."reviews" TO "service_role"
GRANT ALL ON TABLE "public"."settings" TO "anon"
GRANT ALL ON TABLE "public"."settings" TO "authenticated"
GRANT ALL ON TABLE "public"."settings" TO "service_role"
GRANT ALL ON TABLE "public"."sidebar_ads" TO "anon"
GRANT ALL ON TABLE "public"."sidebar_ads" TO "authenticated"
GRANT ALL ON TABLE "public"."sidebar_ads" TO "service_role"
GRANT ALL ON TABLE "public"."taxes" TO "anon"
GRANT ALL ON TABLE "public"."taxes" TO "authenticated"
GRANT ALL ON TABLE "public"."taxes" TO "service_role"
GRANT ALL ON TABLE "public"."transactions" TO "anon"
GRANT ALL ON TABLE "public"."transactions" TO "authenticated"
GRANT ALL ON TABLE "public"."transactions" TO "service_role"
GRANT ALL ON TABLE "public"."users" TO "anon"
GRANT ALL ON TABLE "public"."users" TO "authenticated"
GRANT ALL ON TABLE "public"."users" TO "service_role"
GRANT ALL ON TABLE "public"."wishlists" TO "anon"
GRANT ALL ON TABLE "public"."wishlists" TO "authenticated"
GRANT ALL ON TABLE "public"."wishlists" TO "service_role"

