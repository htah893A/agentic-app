export class MissingEnvironmentVariable extends Error {
  override name = 'MissingEnvironmentVariable';
  constructor(variableName: string) {
    super(`Environment variable not passed: ${variableName}`);
  }
}

export class MissingBodyData extends Error {
  override name = 'MissingBodyData';
  constructor() {
    super(`Body data is empty`);
  }
}

export class MissingParameters extends Error {
  override name = 'MissingParameters';
  constructor(parameterName: string) {
    super(`Parameter is empty: ${parameterName}`);
  }
}

export class InvalidParameters extends Error {
  override name = 'InvalidParameters';
  constructor(message = 'Parameters are invalid') {
    super(message);
  }
}

export class InvalidJsonError extends Error {
  override name = 'InvalidJsonError';
  constructor(message = 'Invalid JSON') {
    super(message);
  }
}

export class UnauthorizedError extends Error {
  override name = 'UnauthorizedError';
  constructor(message = 'Unauthorized Error') {
    super(message);
  }
}
