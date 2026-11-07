import type { Request, Response } from '../mini-express.js';
import type { ApiResponse } from '../../shared/types.js';

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: (err?: any) => void
) {
  const isNotFound = err.message.includes('not found');
  const isValidation = err.message.toLowerCase().includes('validation') || err.message.toLowerCase().includes('cannot be empty');

  const statusCode = isNotFound ? 404 : isValidation ? 400 : 500;
  const errorCode = isNotFound ? 'NOT_FOUND' : isValidation ? 'VALIDATION_FAILED' : 'INTERNAL_SERVER_ERROR';

  const response: ApiResponse = {
    success: false,
    error: {
      code: errorCode,
      message: err.message,
    },
  };

  res.status(statusCode).json(response);
}
