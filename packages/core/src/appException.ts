export class AuthorizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthorizationError';
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class MissingEnvironmentVariable extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MissingEnvironmentVariable';
  }
}

export class MissingBodyData extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MissingBodyData';
  }
}

export class MissingParameters extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MissingParameters';
  }
}

export class InvalidParameters extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidParameters';
  }
}

export class InvalidJsonError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidJsonError';
  }
}

export class UnauthorizedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnauthorizedError';
  }
}
