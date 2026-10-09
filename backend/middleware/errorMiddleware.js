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
  // Otherwise use res.statusCode only when it is 400 or more;
  // If res.statusCode is below 400 (200, 201, 3xx), use 500 because an error must never be sent with a success status.
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
  } else if (res.statusCode && res.statusCode >= 400) {
    statusCode = res.statusCode;
  } else {
    // An error must never be sent with a success status (200, 201, 3xx)
    statusCode = 500;
  }

  // Log with console.error only when the final status is 500 or more.
  // For statuses below 500 (404 from notFound, 400 for bad JSON, 413, etc.), log nothing:
  // they are expected client mistakes, and their URLs can contain QR tokens.
  // For 500 and above, log console.error("[maitred]", err.message) and nothing else
  // (never the error object, request bodies, headers or tokens).
  if (statusCode >= 500) {
    console.error('[maitred]', err?.message || '');
  }

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
