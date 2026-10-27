/** Application errors carry a safe, user-presentable message. Anything else is treated as internal. */
export class AppError extends Error {
  readonly status: number = 400;
  readonly code: string = "BAD_REQUEST";
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends AppError {
  override readonly status = 422;
  override readonly code = "VALIDATION";
  constructor(
    message: string,
    readonly fieldErrors: Record<string, string> = {},
  ) {
    super(message);
  }
}

export class UnauthenticatedError extends AppError {
  override readonly status = 401;
  override readonly code = "UNAUTHENTICATED";
  constructor(message = "Please sign in to continue.") {
    super(message);
  }
}

export class ForbiddenError extends AppError {
  override readonly status = 403;
  override readonly code = "FORBIDDEN";
  constructor(message = "You do not have permission to do that.") {
    super(message);
  }
}

export class NotFoundError extends AppError {
  override readonly status = 404;
  override readonly code = "NOT_FOUND";
  constructor(message = "We couldn't find that.") {
    super(message);
  }
}

export class ConflictError extends AppError {
  override readonly status = 409;
  override readonly code = "CONFLICT";
}

export class RateLimitError extends AppError {
  override readonly status = 429;
  override readonly code = "RATE_LIMITED";
  constructor(message = "Too many attempts. Please wait a moment and try again.") {
    super(message);
  }
}

export class EntitlementError extends AppError {
  override readonly status = 402;
  override readonly code = "PLAN_LIMIT";
}

export class ConfigurationError extends AppError {
  override readonly status = 503;
  override readonly code = "NOT_CONFIGURED";
}

export function isAppError(e: unknown): e is AppError {
  return e instanceof AppError;
}
