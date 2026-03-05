import type { FastifyReply, FastifyRequest } from "fastify";

export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

function isFastifyValidationError(
  error: Error,
): error is Error & { validation: unknown[]; statusCode: number } {
  return "validation" in error && "statusCode" in error;
}

function hasStatusCode(
  error: Error,
): error is Error & { statusCode: number } {
  return "statusCode" in error;
}

export function errorHandler(
  error: Error,
  request: FastifyRequest,
  reply: FastifyReply,
) {
  if (error instanceof AppError) {
    return reply.status(error.statusCode).send({
      error: error.message,
    });
  }

  if (isFastifyValidationError(error)) {
    return reply.status(400).send({
      error: "Validation error",
      details: error.validation,
    });
  }

  const statusCode = hasStatusCode(error) ? error.statusCode : 500;
  const message =
    statusCode >= 500 ? "Internal server error" : error.message;

  if (statusCode >= 500) {
    request.log.error(error);
  }

  return reply.status(statusCode).send({ error: message });
}
