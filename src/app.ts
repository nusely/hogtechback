import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
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
import logRoutes from './routes/log.routes';
import settingsRoutes from './routes/settings.routes';
import customerRoutes from './routes/customer.routes';
import cartRoutes from './routes/cart.routes';
import notificationRoutes from './routes/notification.routes';
import { errorHandler, notFound } from './middleware/error.middleware';
import { sanitizeInput } from './middleware/sanitize.middleware';
import { requestTimeout } from './middleware/timeout.middleware';

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

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    // Only in development - in production, require origin
    if (!origin) {
      if (process.env.NODE_ENV === 'development') {
        return callback(null, true);
      }
      return callback(new Error('CORS: Origin header required'));
    }
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      // In production, reject unknown origins
      if (process.env.NODE_ENV === 'production') {
        console.warn(`CORS: Blocked request from origin: ${origin}`);
        return callback(new Error('CORS: Origin not allowed'));
      }
      // In development, allow but log
      console.warn(`CORS: Allowing unknown origin in development: ${origin}`);
      callback(null, true);
    }
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
app.use('/api/logs', logRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/notifications', notificationRoutes);

// Error handling
app.use(notFound);
app.use(errorHandler);

export default app;

