/** Error carrying an HTTP status code (and optional response details) for `errorHandler` to serialize. */
export class HttpError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public details?: unknown
  ) {
    super(message);
  }
}

/** Builds a 404 {@link HttpError} for a named resource; use for missing-or-unauthorized lookups to avoid leaking which. */
export const notFound = (resource = "Resource") =>
  new HttpError(404, `${resource} not found`);

/** Builds a 400 {@link HttpError}, optionally carrying structured `details` for the response body. */
export const badRequest = (message: string, details?: unknown) =>
  new HttpError(400, message, details);
