-- Fix notifications table schema
-- Add missing columns if they don't exist

-- Add is_read column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'notifications' 
        AND column_name = 'is_read'
    ) THEN
        ALTER TABLE public.notifications ADD COLUMN is_read boolean DEFAULT false;
        COMMENT ON COLUMN public.notifications.is_read IS 'Whether the notification has been read';
    END IF;
END $$;

-- Add read_at column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'notifications' 
        AND column_name = 'read_at'
    ) THEN
        ALTER TABLE public.notifications ADD COLUMN read_at timestamptz;
        COMMENT ON COLUMN public.notifications.read_at IS 'Timestamp when the notification was marked as read';
    END IF;
END $$;

-- Add action_url column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'notifications' 
        AND column_name = 'action_url'
    ) THEN
        ALTER TABLE public.notifications ADD COLUMN action_url varchar(500);
        COMMENT ON COLUMN public.notifications.action_url IS 'Optional URL to navigate to when notification is clicked';
    END IF;
END $$;

-- Ensure type column exists and has proper constraint
DO $$ 
BEGIN
    -- Check if type column exists
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'notifications' 
        AND column_name = 'type'
    ) THEN
        -- Drop existing constraint if it exists
        ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
        
        -- Add constraint for valid notification types
        ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check 
            CHECK (type IN ('order', 'stock', 'user', 'alert', 'success', 'payment', 'review'));
    END IF;
END $$;

