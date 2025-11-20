import { Router } from 'express';
import { captureError, captureMessage } from '../utils/sentry';

const router = Router();

// Test endpoint to verify Sentry is working
router.get('/sentry-test-error', (req, res) => {
  try {
    // Capture a test message
    captureMessage('Sentry test: Manual test message from backend', 'info');
    
    // Throw a test error
    throw new Error('🧪 Sentry Backend Test Error - This is intentional to test error tracking!');
  } catch (error) {
    captureError(error as Error, {
      test: true,
      endpoint: '/api/test/sentry-test-error',
      timestamp: new Date().toISOString(),
    });
    res.status(200).json({
      success: true,
      message: 'Test error sent to Sentry! Check your Sentry dashboard at https://sentry.io',
      error: error instanceof Error ? error.message : 'Unknown error',
      sentryProject: 'Check Issues tab in your Sentry dashboard',
    });
  }
});

// Test endpoint that just logs a message (no error)
router.get('/sentry-test-message', (req, res) => {
  captureMessage('🧪 Sentry test: Backend is working correctly!', 'info');
  res.json({
    success: true,
    message: 'Test message sent to Sentry! Check your Sentry dashboard.',
  });
});

export default router;

