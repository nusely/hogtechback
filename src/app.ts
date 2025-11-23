import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './config/swagger';
import { initSentry, setupSentryErrorHandler } from './utils/sentry';
import productRoutes from './routes/product.routes';
import orderRoutes from './routes/order.routes';
import paymentRoutes from './routes/payment.routes';
import transactionRoutes from './routes/transaction.routes';
import bannerRoutes from './routes/banner.routes';
import investmentRoutes from './routes/investment.routes';
import uploadRoutes from './routes/upload.routes';
import contactRoutes from './routes/contact.routes';
import authRoutes from './routes/auth.routes';
import dealRoutes from './routes/deal.routes';
import discountRoutes from './routes/discount.routes';
import couponRoutes from './routes/coupon.routes';
import logRoutes from './routes/log.routes';
import settingsRoutes from './routes/settings.routes';
import customerRoutes from './routes/customer.routes';
import cartRoutes from './routes/cart.routes';
import notificationRoutes from './routes/notification.routes';
import exportRoutes from './routes/export.routes';
import testRoutes from './routes/test.routes';
import returnRequestRoutes from './routes/returnRequest.routes';
import { errorHandler, notFound } from './middleware/error.middleware';
import { sanitizeInput } from './middleware/sanitize.middleware';
import { requestTimeout } from './middleware/timeout.middleware';

// Initialize Sentry FIRST (before creating Express app)
initSentry();

const app: Application = express();

// Trust proxy - important for accurate IP addresses behind reverse proxies/load balancers
// Set TRUST_PROXY env var to 'true' or specific proxy count (e.g., '1' for single proxy)
if (process.env.TRUST_PROXY === 'true') {
  app.set('trust proxy', true);
} else if (process.env.TRUST_PROXY) {
  const proxyCount = parseInt(process.env.TRUST_PROXY, 10);
  if (!isNaN(proxyCount)) {
    app.set('trust proxy', proxyCount);
  }
}

// Security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false, // Allow iframe embeds if needed
}));

// Middleware
const allowedOrigins = process.env.FRONTEND_URL 
  ? process.env.FRONTEND_URL.split(',').map(url => url.trim())
  : ['http://localhost:3000', 'http://127.0.0.1:3000'];

// Normalize origins - handle www and non-www variants
// If hogtechgh.com is in the list, also add www.hogtechgh.com automatically
const normalizedOrigins = [...allowedOrigins];
allowedOrigins.forEach(origin => {
  if (origin.includes('hogtechgh.com') && !origin.includes('www.')) {
    const wwwVariant = origin.replace('hogtechgh.com', 'www.hogtechgh.com');
    if (!normalizedOrigins.includes(wwwVariant)) {
      normalizedOrigins.push(wwwVariant);
    }
  }
  if (origin.includes('www.hogtechgh.com')) {
    const nonWwwVariant = origin.replace('www.hogtechgh.com', 'hogtechgh.com');
    if (!normalizedOrigins.includes(nonWwwVariant)) {
      normalizedOrigins.push(nonWwwVariant);
    }
  }
});

// Log allowed origins on startup (helpful for debugging)
if (process.env.NODE_ENV === 'production') {
  console.log('🔒 CORS Configuration:');
  console.log(`   Allowed origins: ${normalizedOrigins.join(', ')}`);
  if (!process.env.FRONTEND_URL) {
    console.warn('⚠️  WARNING: FRONTEND_URL not set! Using default localhost origins.');
    console.warn('   Set FRONTEND_URL in Render.com environment variables to allow production frontend.');
  }
}

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin for:
    // - Health checks (HEAD requests from monitoring services like Render.com)
    // - Mobile apps
    // - Server-to-server requests
    // - Development environment
    if (!origin) {
      // Allow all requests without origin
      // This is safe because:
      // 1. Health checks (HEAD/GET) don't return sensitive data
      // 2. API endpoints still require authentication
      // 3. Monitoring services and load balancers need this
      return callback(null, true);
    }
    
    if (normalizedOrigins.indexOf(origin) !== -1) {
      if (process.env.NODE_ENV === 'production') {
        console.log(`✅ CORS: Allowing request from origin: ${origin}`);
      }
      return callback(null, true);
    }
    
    // Allow Vercel preview deployments (pattern: *.vercel.app)
    if (origin.includes('.vercel.app')) {
      if (process.env.NODE_ENV === 'production') {
        console.log(`✅ CORS: Allowing Vercel preview deployment: ${origin}`);
      }
      return callback(null, true);
    }
    
    // Allow Vercel production deployments (pattern: *.vercel.app or custom domain)
    if (origin.includes('vercel.app') || origin.includes('vercel.com')) {
      if (process.env.NODE_ENV === 'production') {
        console.log(`✅ CORS: Allowing Vercel deployment: ${origin}`);
      }
      return callback(null, true);
    }
    
    // In production, reject unknown origins
    if (process.env.NODE_ENV === 'production') {
      console.error(`❌ CORS: Blocked request from origin: ${origin}`);
      console.error(`   Allowed origins: ${normalizedOrigins.join(', ')}`);
      console.error(`   💡 Tip: Add ${origin} to FRONTEND_URL environment variable in Render.com`);
      return callback(new Error(`CORS: Origin ${origin} not allowed. Add it to FRONTEND_URL env var.`));
    }
    // In development, allow but log
    console.warn(`⚠️  CORS: Allowing unknown origin in development: ${origin}`);
    callback(null, true);
  },
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request timeout - 30 seconds default
app.use(requestTimeout(30000));

// Input sanitization for POST, PUT, PATCH requests (XSS prevention)
// Skip sanitization for certain routes that may contain HTML intentionally
app.use((req, res, next) => {
  // Skip sanitization for file uploads and certain content types
  const contentType = req.get('content-type') || '';
  if (
    req.path.includes('/upload') ||
    req.path.includes('/presign') ||
    contentType.includes('multipart/form-data')
  ) {
    return next();
  }
  
  // Apply sanitization for POST, PUT, PATCH requests
  if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
    sanitizeInput(req, res, next);
  } else {
    next();
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Hogtech API is running' });
});

// API Documentation (Swagger UI)
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customSiteTitle: 'Hogtech API Documentation',
  customCss: `
    .swagger-ui .topbar { display: none }
    .swagger-ui .info .title { color: #00afef; }
    .swagger-ui .btn.authorize { background-color: #00afef; border-color: #00afef; }
    .swagger-ui .btn.authorize:hover { background-color: #0099d6; border-color: #0099d6; }
  `,
  customfavIcon: 'https://files.hogtechgh.com/IMG_0718.PNG',
}));

// Export OpenAPI spec as JSON
app.get('/api-docs.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});

// API Routes
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/banners', bannerRoutes);
app.use('/api/investment', investmentRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/contact', contactRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/deals', dealRoutes);
app.use('/api/discounts', discountRoutes);
app.use('/api/coupons', couponRoutes);
app.use('/api/logs', logRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/export', exportRoutes);
app.use('/api/test', testRoutes);
app.use('/api/return-requests', returnRequestRoutes); // Sentry test endpoints

// Setup Sentry error handler (must be AFTER routes but BEFORE other error handlers)
setupSentryErrorHandler(app);

// Error handling
app.use(notFound);
app.use(errorHandler);

export default app;

