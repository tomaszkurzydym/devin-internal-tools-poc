import type { ErrorRequestHandler, RequestHandler } from "express";

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, string>,
  ) {
    super(message);
  }
}

export const notFound = (message = "Not found") => new HttpError(404, "not_found", message);
export const conflict = (message: string) => new HttpError(409, "conflict", message);
export const validationError = (details: Record<string, string>) =>
  new HttpError(400, "validation_error", "Validation failed", details);

/** Mutations must be JSON: blocks simple cross-site form posts in addition to the SameSite cookie. */
export const requireJson: RequestHandler = (req, _res, next) => {
  if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method) && !req.is("application/json")) {
    return next(new HttpError(415, "unsupported_media_type", "Content-Type must be application/json"));
  }
  next();
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
    return;
  }
  if (err && typeof err === "object" && "type" in err && err.type === "entity.parse.failed") {
    res.status(400).json({ error: { code: "invalid_json", message: "Malformed JSON body" } });
    return;
  }
  console.error(err);
  res.status(500).json({ error: { code: "internal_error", message: "Internal server error" } });
};
