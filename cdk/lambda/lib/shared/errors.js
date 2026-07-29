class OperationalError extends Error {
  constructor(message, statusCode = 500, code = "INTERNAL_ERROR", details = null) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

class BadRequestError extends OperationalError {
  constructor(message = "Bad request", details = null) {
    super(message, 400, "BAD_REQUEST", details);
  }
}

class UnauthorizedError extends OperationalError {
  constructor(message = "Unauthorized", details = null) {
    super(message, 401, "UNAUTHORIZED", details);
  }
}

class NotFoundError extends OperationalError {
  constructor(message = "Not found", details = null) {
    super(message, 404, "NOT_FOUND", details);
  }
}

class InternalServerError extends OperationalError {
  constructor(message = "Internal server error", details = null) {
    super(message, 500, "INTERNAL_SERVER_ERROR", details);
  }
}

function isOperationalError(error) {
  return error instanceof OperationalError;
}

function toOperationalError(error) {
  if (isOperationalError(error)) return error;
  if (error && typeof error.message === "string") {
    return new InternalServerError(error.message);
  }
  return new InternalServerError();
}

module.exports = {
  OperationalError,
  BadRequestError,
  UnauthorizedError,
  NotFoundError,
  InternalServerError,
  isOperationalError,
  toOperationalError,
};
