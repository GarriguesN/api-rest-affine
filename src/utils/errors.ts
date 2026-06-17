/**
 * Typed error classes for the application.
 */

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isOperational: boolean;

  constructor(message: string, statusCode: number, code: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    const msg = id ? `${resource} '${id}' not found` : `${resource} not found`;
    super(msg, 404, 'NOT_FOUND');
  }
}

export class UnauthorizedError extends AppError {
  constructor(reason = 'Invalid or missing API key') {
    super(reason, 401, 'UNAUTHORIZED');
  }
}

export class ForbiddenError extends AppError {
  constructor(reason = 'Access denied') {
    super(reason, 403, 'FORBIDDEN');
  }
}

export class BadRequestError extends AppError {
  constructor(message: string) {
    super(message, 400, 'BAD_REQUEST');
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(service: string, reason?: string) {
    const msg = reason ? `${service} unavailable: ${reason}` : `${service} unavailable`;
    super(msg, 503, 'SERVICE_UNAVAILABLE');
  }
}

export class GraphQLError extends AppError {
  public readonly graphqlErrors: unknown[];

  constructor(message: string, graphqlErrors: unknown[] = []) {
    super(message, 502, 'GRAPHQL_ERROR');
    this.graphqlErrors = graphqlErrors;
  }
}
