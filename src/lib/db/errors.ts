// src/lib/db/errors.ts
import { env } from '../env';

/**
 * Custom database error types
 */
export class DatabaseError extends Error {
  constructor(
    message: string,
    public code: string,
    public originalError?: Error
  ) {
    super(message);
    this.name = 'DatabaseError';
  }
}

export class ValidationError extends Error {
  constructor(message: string, public field?: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class AccessDeniedError extends Error {
  constructor(message: string = 'Access denied') {
    super(message);
    this.name = 'AccessDeniedError';
  }
}

export class NotFoundError extends Error {
  constructor(resource: string, id?: string) {
    super(`${resource}${id ? ` with ID ${id}` : ''} not found`);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
  }
}

/**
 * Database error codes and their meanings
 */
export const DB_ERROR_CODES = {
  // PostgreSQL error codes
  UNIQUE_VIOLATION: '23505',
  FOREIGN_KEY_VIOLATION: '23503',
  NOT_NULL_VIOLATION: '23502',
  CHECK_VIOLATION: '23514',
  CONNECTION_ERROR: '08006',
  INVALID_SQL: '42601',
  INSUFFICIENT_PRIVILEGE: '42501',
  
  // Custom application codes
  ORGANIZATION_NOT_FOUND: 'ORG_001',
  INVALID_TENANT_ACCESS: 'TEN_001',
  CONTRACT_EXPIRED: 'CON_001',
  BUILDING_OCCUPIED: 'BLD_001',
  DUPLICATE_CONSUMPTION: 'CSM_001',
} as const;

/**
 * Error handler for database operations
 */
export class DatabaseErrorHandler {
  /**
   * Handle and categorize database errors
   */
  static handleError(error: any): DatabaseError {
    // PostgreSQL specific errors
    if (error.code) {
      switch (error.code) {
        case DB_ERROR_CODES.UNIQUE_VIOLATION:
          return new DatabaseError(
            'Record already exists with this unique value',
            'DUPLICATE_RECORD',
            error
          );
          
        case DB_ERROR_CODES.FOREIGN_KEY_VIOLATION:
          return new DatabaseError(
            'Referenced record does not exist',
            'INVALID_REFERENCE',
            error
          );
          
        case DB_ERROR_CODES.NOT_NULL_VIOLATION:
          return new DatabaseError(
            'Required field is missing',
            'MISSING_REQUIRED_FIELD',
            error
          );
          
        case DB_ERROR_CODES.CONNECTION_ERROR:
          return new DatabaseError(
            'Database connection failed',
            'CONNECTION_FAILED',
            error
          );
          
        case DB_ERROR_CODES.INSUFFICIENT_PRIVILEGE:
          return new DatabaseError(
            'Insufficient database privileges',
            'ACCESS_DENIED',
            error
          );
      }
    }

    // Drizzle/Neon specific errors
    if (error.message?.includes('connection')) {
      return new DatabaseError(
        'Database connection error',
        'CONNECTION_ERROR',
        error
      );
    }

    if (error.message?.includes('timeout')) {
      return new DatabaseError(
        'Database operation timed out',
        'TIMEOUT',
        error
      );
    }

    // Generic database error
    return new DatabaseError(
      error.message || 'Unknown database error',
      'UNKNOWN_ERROR',
      error
    );
  }

  /**
   * Log database errors with context
   */
  static logError(
    error: Error, 
    context: {
      operation: string;
      organizationId?: string;
      userId?: string;
      metadata?: Record<string, any>;
    }
  ) {
    const logData = {
      timestamp: new Date().toISOString(),
      error: {
        name: error.name,
        message: error.message,
        code: (error as any).code,
        stack: env.NODE_ENV === 'development' ? error.stack : undefined,
      },
      context,
    };

    if (env.NODE_ENV === 'development') {
      console.error('🔥 Database Error:', logData);
    } else {
      // In production, you might want to send to external logging service
      console.error('Database Error:', JSON.stringify(logData));
    }
  }

  /**
   * Retry logic for transient errors
   */
  static async withRetry<T>(
    operation: () => Promise<T>,
    options: {
      maxRetries?: number;
      delayMs?: number;
      backoff?: boolean;
      retryableErrors?: string[];
    } = {}
  ): Promise<T> {
    const {
      maxRetries = 3,
      delayMs = 1000,
      backoff = true,
      retryableErrors = ['CONNECTION_ERROR', 'TIMEOUT', '08006']
    } = options;

    let lastError: Error;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        
        // Check if error is retryable
        const isRetryable = retryableErrors.some(code => 
          error.code === code || error.message?.includes(code)
        );

        if (!isRetryable || attempt === maxRetries) {
          throw this.handleError(error);
        }

        // Calculate delay with exponential backoff
        const delay = backoff ? delayMs * Math.pow(2, attempt - 1) : delayMs;
        
        console.warn(`Database operation failed (attempt ${attempt}/${maxRetries}), retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw this.handleError(lastError!);
  }
}

/**
 * Database operation wrapper with error handling and monitoring
 */
export function withErrorHandling<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  operationName: string
): T {
  return (async (...args: any[]) => {
    const timer = performance.now();
    
    try {
      const result = await fn(...args);
      
      // Log successful operations in development
      if (env.NODE_ENV === 'development') {
        const duration = performance.now() - timer;
        if (duration > 500) {
          console.log(`⏱️  ${operationName} took ${duration.toFixed(2)}ms`);
        }
      }
      
      return result;
    } catch (error) {
      const duration = performance.now() - timer;
      
      DatabaseErrorHandler.logError(error as Error, {
        operation: operationName,
        metadata: { duration, args: args.length },
      });
      
      throw DatabaseErrorHandler.handleError(error);
    }
  }) as T;
}

/**
 * Transaction error handler
 */
export async function handleTransactionError(
  error: Error,
  context: {
    operation: string;
    organizationId: string;
    userId?: string;
  }
): Promise<never> {
  DatabaseErrorHandler.logError(error, context);

  // Specific handling for transaction errors
  if (error.message?.includes('transaction')) {
    throw new DatabaseError(
      'Transaction failed - operation was rolled back',
      'TRANSACTION_FAILED',
      error
    );
  }

  if (error.message?.includes('deadlock')) {
    throw new DatabaseError(
      'Database deadlock detected - please try again',
      'DEADLOCK_DETECTED',
      error
    );
  }

  throw DatabaseErrorHandler.handleError(error);
}

/**
 * Graceful error responses for API endpoints
 */
export function createErrorResponse(error: Error) {
  if (error instanceof ValidationError) {
    return {
      success: false,
      message: error.message,
      code: 'VALIDATION_ERROR',
      field: error.field,
    };
  }

  if (error instanceof NotFoundError) {
    return {
      success: false,
      message: error.message,
      code: 'NOT_FOUND',
    };
  }

  if (error instanceof AccessDeniedError) {
    return {
      success: false,
      message: error.message,
      code: 'ACCESS_DENIED',
    };
  }

  if (error instanceof ConflictError) {
    return {
      success: false,
      message: error.message,
      code: 'CONFLICT',
    };
  }

  if (error instanceof DatabaseError) {
    return {
      success: false,
      message: env.NODE_ENV === 'production' ? 'Database operation failed' : error.message,
      code: error.code,
    };
  }

  // Unknown error
  return {
    success: false,
    message: env.NODE_ENV === 'production' ? 'An unexpected error occurred' : error.message,
    code: 'UNKNOWN_ERROR',
  };
}

/**
 * Database operation logger
 */
export class DatabaseLogger {
  private static logs: Array<{
    timestamp: Date;
    operation: string;
    duration: number;
    success: boolean;
    error?: string;
    organizationId?: string;
  }> = [];

  static log(
    operation: string,
    duration: number,
    success: boolean,
    organizationId?: string,
    error?: Error
  ) {
    this.logs.push({
      timestamp: new Date(),
      operation,
      duration,
      success,
      organizationId,
      error: error?.message,
    });

    // Keep only recent logs
    if (this.logs.length > 1000) {
      this.logs = this.logs.slice(-1000);
    }
  }

  static getRecentErrors(count = 10) {
    return this.logs
      .filter(log => !log.success)
      .slice(-count)
      .reverse();
  }

  static getOperationStats(operation?: string) {
    const relevantLogs = operation 
      ? this.logs.filter(log => log.operation === operation)
      : this.logs;

    if (relevantLogs.length === 0) return null;

    const successful = relevantLogs.filter(log => log.success).length;
    const failed = relevantLogs.length - successful;
    const avgDuration = relevantLogs.reduce((sum, log) => sum + log.duration, 0) / relevantLogs.length;

    return {
      total: relevantLogs.length,
      successful,
      failed,
      successRate: (successful / relevantLogs.length) * 100,
      averageDuration: avgDuration,
    };
  }

  static exportLogs() {
    return {
      logs: this.logs,
      summary: this.getOperationStats(),
      exportedAt: new Date().toISOString(),
    };
  }

  static clearLogs() {
    this.logs = [];
  }
}