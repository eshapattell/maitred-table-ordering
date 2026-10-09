// errorMiddleware.js: Centralized error handling for maitred

/**
 * Middleware to catch 404 (Not Found) errors for unhandled routes
 */
export const notFound = (req, res, next) => {
  const error = new Error(`Not Found - ${req.originalUrl}`);
  res.status(404);
  next(error);
};

/**
 * Central error handler middleware returning JSON formatted responses.
 * Respects HTTP status codes and never leaks internal details in production.
 */
export const errorHandler = (err, req, res, next) => {
  // If headers were already sent to client, delegate to default Express error handler
  if (res.headersSent) {
    next(err);
    return;
  }

  // Determine HTTP status code:
  // Check if err.status or err.statusCode is an integer in the 400-599 range (e.g. body-parser errors);
  // Otherwise use res.statusCode if not 200; otherwise fall back to 500.
  const rawStatus = Number.isInteger(err?.status)
    ? err.status
    : (Number.isInteger(err?.statusCode) ? err.statusCode : null);

  let statusCode;
  if (err?.type === 'entity.parse.failed') {
    statusCode = 400;
  } else if (err?.type === 'entity.too.large') {
    statusCode = 413;
  } else if (rawStatus !== null && rawStatus >= 400 && rawStatus <= 599) {
    statusCode = rawStatus;
  } else if (res.statusCode && res.statusCode !== 200) {
    statusCode = res.statusCode;
  } else {
    statusCode = 500;
  }

  // Safe logging: log fixed label plus err.message only.
  // For parse failures, log only the fixed string "invalid JSON body" so raw payload fragments are never logged.
  const logMessage = err?.type === 'entity.parse.failed'
    ? 'invalid JSON body'
    : (err?.message || '');
  console.error('[maitred]', logMessage);

  // Determine response message
  let message;
  if (err?.type === 'entity.parse.failed') {
    message = 'Invalid JSON body';
  } else if (err?.type === 'entity.too.large') {
    message = 'Payload too large';
  } else if (statusCode >= 500) {
    message = process.env.NODE_ENV === 'development'
      ? (err?.message || 'Internal Server Error')
      : 'Internal Server Error';
  } else {
    message = err?.message || 'Error';
  }

  const response = { message };

  if (process.env.NODE_ENV === 'development') {
    response.stack = err?.stack;
  }

  res.status(statusCode).json(response);
};
