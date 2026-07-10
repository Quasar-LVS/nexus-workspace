export class NexusError extends Error {
  public status: number;
  public code: string;
  public details?: any;

  constructor(message: string, status: number = 500, code: string = "INTERNAL_SERVER_ERROR", details?: any) {
    super(message);
    this.name = this.constructor.name;
    this.status = status;
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ValidationError extends NexusError {
  constructor(message: string, details?: any) {
    super(message, 400, "VALIDATION_ERROR", details);
  }
}

export class AuthenticationError extends NexusError {
  constructor(message: string = "Unauthorized. Please authenticate first.") {
    super(message, 401, "UNAUTHORIZED");
  }
}

export class ForbiddenError extends NexusError {
  constructor(message: string = "Forbidden. You do not have permissions for this action.") {
    super(message, 403, "FORBIDDEN");
  }
}

export class NotFoundError extends NexusError {
  constructor(message: string) {
    super(message, 404, "NOT_FOUND");
  }
}

export class DatabaseError extends NexusError {
  constructor(message: string, details?: any) {
    super(message, 500, "DATABASE_ERROR", details);
  }
}

export class NovaAIError extends NexusError {
  constructor(message: string, details?: any) {
    super(message, 500, "NOVA_AI_ERROR", details);
  }
}
