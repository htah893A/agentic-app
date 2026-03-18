/**
 * Structured logger for Lambda functions
 * Outputs JSON format for CloudWatch Logs Insights
 */

export class Logger {
  constructor(private context: string) {}

  /**
   * Log with structured format
   */
  private sanitize(input: string): string {
    return input.replace(/[\n\r]/g, '');
  }

  private log(
    level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG',
    message: string,
    metadata?: object,
  ) {
    const logEntry = {
      level,
      context: this.context,
      message: this.sanitize(message),
      timestamp: new Date().toISOString(),
      ...metadata,
    };

    const logString = JSON.stringify(logEntry);

    if (level === 'ERROR') {
      console.error(logString);
    } else if (level === 'WARN') {
      console.warn(logString);
    } else {
      console.log(logString);
    }
  }

  /**
   * Log informational message
   */
  info(message: string, metadata?: object) {
    this.log('INFO', message, metadata);
  }

  /**
   * Log warning message
   */
  warn(message: string, metadata?: object) {
    this.log('WARN', message, metadata);
  }

  /**
   * Log error with full details
   */
  error(message: string, error: Error, metadata?: object) {
    this.log('ERROR', message, {
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
      },
      ...metadata,
    });
  }

  /**
   * Log debug information (only in development)
   */
  debug(message: string, metadata?: object) {
    if (process.env.NODE_ENV !== 'production') {
      this.log('DEBUG', message, metadata);
    }
  }
}
