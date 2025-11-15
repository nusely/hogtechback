import { Request, Response, NextFunction } from 'express';
import { errorResponse } from '../utils/responseHandlers';

/**
 * File magic numbers (signatures) for common image formats
 * These are the first few bytes that identify the file type
 */
const FILE_SIGNATURES: { [key: string]: number[][] } = {
  'image/jpeg': [
    [0xff, 0xd8, 0xff], // JPEG
  ],
  'image/png': [
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], // PNG
  ],
  'image/gif': [
    [0x47, 0x49, 0x46, 0x38, 0x37, 0x61], // GIF87a
    [0x47, 0x49, 0x46, 0x38, 0x39, 0x61], // GIF89a
  ],
  'image/webp': [
    [0x52, 0x49, 0x46, 0x46], // RIFF (WebP starts with RIFF)
  ],
  'image/svg+xml': [
    [0x3c, 0x73, 0x76, 0x67], // <svg
    [0x3c, 0x3f, 0x78, 0x6d, 0x6c], // <?xml (SVG can start with XML declaration)
  ],
};

/**
 * Validates file content by checking magic numbers
 * This prevents MIME type spoofing attacks
 */
export const validateFileContent = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // Get uploaded files from multer
  const files = req.files as { [fieldname: string]: Express.Multer.File[] } | Express.Multer.File[] | undefined;

  if (!files) {
    return next();
  }

  // Handle both single file and multiple files
  const fileArray: Express.Multer.File[] = Array.isArray(files)
    ? files
    : Object.values(files).flat();

  for (const file of fileArray) {
    if (!file.buffer) {
      continue;
    }

    const buffer = file.buffer;
    const mimeType = file.mimetype;

    // Get expected signatures for this MIME type
    const expectedSignatures = FILE_SIGNATURES[mimeType];

    if (!expectedSignatures) {
      return errorResponse(
        res,
        `Unsupported file type: ${mimeType}`,
        400
      );
    }

    // Special handling for WebP (RIFF...WEBP)
    if (mimeType === 'image/webp') {
      if (buffer.length >= 12) {
        const webpHeader = buffer.slice(8, 12);
        const webpSignature = [0x57, 0x45, 0x42, 0x50]; // WEBP
        const isWebP = webpSignature.every((byte, index) => webpHeader[index] === byte);
        if (isWebP) {
          continue; // Valid WebP file
        }
      }
      return errorResponse(
        res,
        `File content does not match declared type ${mimeType}. Possible file spoofing detected.`,
        400
      );
    }

    // Special handling for SVG (text-based format)
    if (mimeType === 'image/svg+xml') {
      const textContent = buffer.toString('utf-8', 0, Math.min(100, buffer.length));
      if (textContent.includes('<svg') || textContent.includes('<?xml')) {
        continue; // Valid SVG file
      }
      return errorResponse(
        res,
        `File content does not match declared type ${mimeType}. Possible file spoofing detected.`,
        400
      );
    }

    // Check if file matches any expected signature
    const matches = expectedSignatures.some((signature) => {
      if (buffer.length < signature.length) {
        return false;
      }

      return signature.every((byte, index) => buffer[index] === byte);
    });

    if (!matches) {
      return errorResponse(
        res,
        `File content does not match declared type ${mimeType}. Possible file spoofing detected.`,
        400
      );
    }
  }

  next();
};

