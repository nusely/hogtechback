import { Response, Send } from 'express';

class SimpleCache {
  private cache: Map<string, { data: any; expiresAt: number }>;
  private cleanupInterval: NodeJS.Timeout;

  constructor(cleanupIntervalMs = 60000) {
    this.cache = new Map();
    // Periodic cleanup
    this.cleanupInterval = setInterval(() => this.cleanup(), cleanupIntervalMs);
  }

  set(key: string, data: any, ttlSeconds: number) {
    const expiresAt = Date.now() + ttlSeconds * 1000;
    this.cache.set(key, { data, expiresAt });
  }

  get(key: string) {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    return entry.data;
  }

  del(key: string) {
    this.cache.delete(key);
  }

  flush() {
    this.cache.clear();
  }

  private cleanup() {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
      }
    }
  }
}

export const cache = new SimpleCache();

// Middleware helper to cache responses
export const cacheMiddleware = (durationSeconds: number) => {
  return (req: any, res: Response, next: any) => {
    // Only cache GET requests
    if (req.method !== 'GET') {
      return next();
    }

    // Use full URL as key
    const key = `__express__${req.originalUrl || req.url}`;
    const cachedBody = cache.get(key);

    if (cachedBody) {
      return res.send(cachedBody);
    }

    // Override res.send/res.json to capture response
    const originalSend = res.send;
    res.send = function (body: any): Response {
      // Cache the response
      if (res.statusCode === 200) {
         cache.set(key, body, durationSeconds);
      }
      return originalSend.call(this, body);
    };

    next();
  };
};

