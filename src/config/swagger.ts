import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Hogtech E-Commerce API',
      version: '1.0.0',
      description: 'Comprehensive API documentation for Hedgehog Technologies E-Commerce Platform',
      contact: {
        name: 'Hedgehog Technologies',
        email: 'support@hogtechgh.com',
        url: 'https://hogtechgh.com',
      },
      license: {
        name: 'Private',
      },
    },
    servers: [
      {
        url: 'http://localhost:5000',
        description: 'Development server',
      },
      {
        url: 'https://api.hogtechgh.com',
        description: 'Production server',
      },
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Enter your JWT token from login',
        },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: false,
            },
            message: {
              type: 'string',
              example: 'Error message',
            },
            error: {
              type: 'string',
            },
          },
        },
        Product: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            slug: { type: 'string' },
            description: { type: 'string' },
            price: { type: 'number' },
            original_price: { type: 'number' },
            category_id: { type: 'string', format: 'uuid' },
            brand_id: { type: 'string', format: 'uuid' },
            sku: { type: 'string' },
            stock_quantity: { type: 'integer' },
            in_stock: { type: 'boolean' },
            is_featured: { type: 'boolean' },
            thumbnail: { type: 'string' },
            images: { type: 'array', items: { type: 'string' } },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' },
          },
        },
        Order: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            order_number: { type: 'string' },
            user_id: { type: 'string', format: 'uuid' },
            customer_id: { type: 'string', format: 'uuid' },
            subtotal: { type: 'number' },
            discount: { type: 'number' },
            tax: { type: 'number' },
            shipping_fee: { type: 'number' },
            total: { type: 'number' },
            status: {
              type: 'string',
              enum: ['pending', 'processing', 'shipped', 'delivered', 'cancelled'],
            },
            payment_status: {
              type: 'string',
              enum: ['pending', 'paid', 'failed', 'refunded'],
            },
            payment_method: { type: 'string' },
            shipping_address: { type: 'object' },
            discount_code: { type: 'string' },
            notes: { type: 'string' },
            created_at: { type: 'string', format: 'date-time' },
          },
        },
        Transaction: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            order_id: { type: 'string', format: 'uuid' },
            user_id: { type: 'string', format: 'uuid' },
            amount: { type: 'number' },
            currency: { type: 'string', example: 'GHS' },
            payment_method: { type: 'string' },
            transaction_reference: { type: 'string' },
            paystack_reference: { type: 'string' },
            status: {
              type: 'string',
              enum: ['pending', 'success', 'failed', 'refunded'],
            },
            payment_status: {
              type: 'string',
              enum: ['pending', 'paid', 'failed', 'refunded', 'cancelled'],
            },
            metadata: { type: 'object' },
            created_at: { type: 'string', format: 'date-time' },
          },
        },
        Coupon: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            code: { type: 'string' },
            description: { type: 'string' },
            discount_type: {
              type: 'string',
              enum: ['percentage', 'fixed_amount', 'free_shipping'],
            },
            discount_value: { type: 'number' },
            min_purchase_amount: { type: 'number' },
            max_discount_amount: { type: 'number' },
            start_date: { type: 'string', format: 'date-time' },
            end_date: { type: 'string', format: 'date-time' },
            usage_limit: { type: 'integer' },
            per_user_limit: { type: 'integer' },
            used_count: { type: 'integer' },
            is_active: { type: 'boolean' },
            applicable_products: { type: 'array', items: { type: 'string' } },
            applicable_categories: { type: 'array', items: { type: 'string' } },
            created_at: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
    security: [
      {
        BearerAuth: [],
      },
    ],
    tags: [
      {
        name: 'Authentication',
        description: 'User authentication and authorization',
      },
      {
        name: 'Products',
        description: 'Product management and listing',
      },
      {
        name: 'Orders',
        description: 'Order creation and management',
      },
      {
        name: 'Transactions',
        description: 'Payment transaction tracking',
      },
      {
        name: 'Coupons',
        description: 'Coupon and discount code management',
      },
      {
        name: 'Categories',
        description: 'Product category management',
      },
      {
        name: 'Brands',
        description: 'Brand management',
      },
      {
        name: 'Cart',
        description: 'Shopping cart operations',
      },
      {
        name: 'Wishlist',
        description: 'User wishlist management',
      },
      {
        name: 'Reviews',
        description: 'Product reviews and ratings',
      },
      {
        name: 'Deals',
        description: 'Flash deals and promotions',
      },
      {
        name: 'Banners',
        description: 'Homepage banner management',
      },
      {
        name: 'Settings',
        description: 'Application settings and configuration',
      },
    ],
  },
  // Paths to files containing OpenAPI definitions
  apis: ['./src/routes/*.ts', './src/controllers/*.ts'],
};

export const swaggerSpec = swaggerJsdoc(options);

