import { Request, Response, NextFunction } from 'express';

/**
 * Request timeout middleware
 * Automatically terminates requests that exceed the timeout duration
 */
export const requestTimeout = (timeoutMs: number = 30000) => {
  return (req: Request, res: Response, next: NextFunction) => {
    // Set a timeout for the request
    const timeout = setTimeout(() => {
      if (!res.headersSent) {
        res.status(408).json({
          success: false,
          message: 'Request timeout. Please try again.',
        });
        res.end();
      }
    }, timeoutMs);

    // Clear timeout when response is sent
    const originalEnd = res.end.bind(res);
    res.end = function (chunk?: any, encoding?: any, cb?: any) {
      clearTimeout(timeout);
      if (cb) {
        return originalEnd(chunk, encoding, cb);
      } else if (encoding) {
        return originalEnd(chunk, encoding);
      } else if (chunk) {
        return originalEnd(chunk);
      } else {
        return originalEnd();
      }
    };

    next();
  };
};

