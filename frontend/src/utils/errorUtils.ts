/**
 * Type-safe error handling utilities
 */

/**
 * Safely extracts an error message from an unknown error type
 * Use this in catch blocks instead of `catch (error: any)`
 *
 * @example
 * try {
 *   await someOperation();
 * } catch (error) {
 *   console.error('Operation failed:', getErrorMessage(error));
 *   throw new Error(getErrorMessage(error));
 * }
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return 'An unknown error occurred';
}

/**
 * Safely extracts error code from Firebase/Firestore errors
 */
export function getErrorCode(error: unknown): string | undefined {
  if (error && typeof error === 'object' && 'code' in error) {
    return String((error as { code: unknown }).code);
  }
  return undefined;
}

/**
 * Type guard to check if an error is a Firebase error with a code
 */
export function isFirebaseError(error: unknown): error is { code: string; message: string } {
  return (
    error !== null &&
    typeof error === 'object' &&
    'code' in error &&
    'message' in error &&
    typeof (error as { code: unknown }).code === 'string'
  );
}
