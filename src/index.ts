// Load environment variables FIRST before any other imports
import dotenv from 'dotenv';
dotenv.config();

// Now import app after env vars are loaded
import app from './app';

const PORT = Number(process.env.PORT) || 5000;

// Listen on all interfaces (0.0.0.0) to accept connections from localhost
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Hogtech API Server running on port ${PORT}`);
  console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 API URL: http://localhost:${PORT}`);
  console.log(`🌐 Listening on 0.0.0.0:${PORT} (all interfaces)`);
});

