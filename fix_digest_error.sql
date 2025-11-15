-- Fix for Paystack webhook digest error
-- This doesn't fix the code, but ensures payment methods table is properly configured

-- Update Paystack payment method to include proper configuration
UPDATE public.payment_methods
SET config = jsonb_build_object(
  'mode', 'test',
  'webhook_secret', '',
  'enabled', false,
  'note', 'Configure Paystack keys in backend .env to enable'
)
WHERE provider = 'Paystack';

-- If Paystack doesn't exist, create it disabled
INSERT INTO public.payment_methods (name, provider, config, is_active)
SELECT 'Paystack', 'Paystack', 
  jsonb_build_object(
    'mode', 'test',
    'webhook_secret', '',
    'enabled', false,
    'note', 'Configure Paystack keys in backend .env to enable'
  ), 
  FALSE
WHERE NOT EXISTS (SELECT 1 FROM public.payment_methods WHERE provider = 'Paystack');

