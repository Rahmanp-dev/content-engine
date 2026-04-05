import { NextResponse } from 'next/server';

/**
 * Standardized error response for API routes.
 */
export function apiError(message: string, status = 500, details?: unknown) {
  return NextResponse.json(
    { error: message, ...(details ? { details } : {}) },
    { status },
  );
}

/**
 * Reads and validates a required environment variable.
 */
export function requireEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new EnvMissingError(key);
  return val;
}

export class EnvMissingError extends Error {
  constructor(key: string) {
    super(`${key} not configured`);
    this.name = 'EnvMissingError';
  }
}

/**
 * Safe JSON body parser.
 */
export async function parseBody<T = Record<string, unknown>>(
  request: Request,
): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new Error('Invalid JSON body');
  }
}

/** Common CORS headers for API routes */
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
} as const;
