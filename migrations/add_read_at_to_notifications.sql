-- Add read_at column to notifications table if it doesn't exist
ALTER TABLE public.notifications 
ADD COLUMN IF NOT EXISTS read_at timestamptz;

-- Add comment for documentation
COMMENT ON COLUMN public.notifications.read_at IS 'Timestamp when the notification was marked as read';

