export class HttpError extends Error {
  constructor(
    public statusCode: number,
    message: string
  ) {
    super(message);
  }
}

export const notFound = (resource = "Resource") => new HttpError(404, `${resource} not found`);
