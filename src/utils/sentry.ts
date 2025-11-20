import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';

const SENTRY_DSN = process.env.SENTRY_DSN;
const ENVIRONMENT = process.env.NODE_ENV || 'development';

export const initSentry = () => {
  if (!SENTRY_DSN) {
    console.warn('⚠️ Sentry DSN not configured. Error tracking disabled.');
    return;
  }

  Sentry.init({
    dsn: SENTRY_DSN,
    environment: ENVIRONMENT,
    
    // Set tracesSampleRate to 1.0 to capture 100% of transactions for performance monitoring.
    tracesSampleRate: ENVIRONMENT === 'production' ? 0.1 : 1.0,

    // Capture 100% of errors
    sampleRate: 1.0,

    // Profiling
    profilesSampleRate: ENVIRONMENT === 'production' ? 0.1 : 1.0,

    integrations: [
      // Add profiling integration
      nodeProfilingIntegration(),
    ],

    // Before sending an event, filter out sensitive information
    beforeSend(event, hint) {
      // Remove sensitive data from request
      if (event.request) {
        // Remove auth headers
        if (event.request.headers) {
          delete event.request.headers['authorization'];
          delete event.request.headers['cookie'];
        }

        // Remove sensitive data from query params
        if (event.request.query_string && typeof event.request.query_string === 'string') {
          const sanitized = event.request.query_string
            .replace(/token=[^&]*/gi, 'token=[REDACTED]')
            .replace(/password=[^&]*/gi, 'password=[REDACTED]')
            .replace(/api_key=[^&]*/gi, 'api_key=[REDACTED]');
          event.request.query_string = sanitized;
        }
      }

      // Remove sensitive data from breadcrumbs
      if (event.breadcrumbs) {
        event.breadcrumbs = event.breadcrumbs.map(breadcrumb => {
          if (breadcrumb.data) {
            const sanitized = { ...breadcrumb.data };
            delete sanitized.password;
            delete sanitized.token;
            delete sanitized.authorization;
            delete sanitized.api_key;
            return { ...breadcrumb, data: sanitized };
          }
          return breadcrumb;
        });
      }

      return event;
    },

    // Configure ignored errors
    ignoreErrors: [
      'ECONNREFUSED',
      'ENOTFOUND',
      'ETIMEDOUT',
    ],
  });

  console.log('✅ Sentry initialized for backend environment:', ENVIRONMENT);
};

// Helper to manually capture errors
export const captureError = (error: Error, context?: Record<string, any>) => {
  if (context) {
    Sentry.setContext('additional', context);
  }
  Sentry.captureException(error);
};

// Helper to capture messages
export const captureMessage = (message: string, level: Sentry.SeverityLevel = 'info') => {
  Sentry.captureMessage(message, level);
};

// Helper to set user context
export const setUserContext = (user: { id: string; email?: string; role?: string }) => {
  Sentry.setUser(user);
};

// Helper to add transaction context
export const addTransactionContext = (name: string, data: Record<string, any>) => {
  const span = Sentry.getActiveSpan();
  if (span) {
    span.setAttribute('transaction.name', name);
    Object.entries(data).forEach(([key, value]) => {
      span.setAttribute(key, value);
    });
  }
};

// Setup Sentry Express error handler (call this AFTER all routes)
export const setupSentryErrorHandler = (app: any) => {
  Sentry.setupExpressErrorHandler(app);
};

