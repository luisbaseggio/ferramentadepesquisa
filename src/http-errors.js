export class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.name = "HttpError";
    this.statusCode = statusCode;
  }
}

export function badRequest(message) {
  return new HttpError(400, message);
}

export function unauthorized(message) {
  return new HttpError(401, message);
}

export function notFound(message) {
  return new HttpError(404, message);
}

export function conflict(message) {
  return new HttpError(409, message);
}
