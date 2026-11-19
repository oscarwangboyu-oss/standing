/**
 * Small HTTP helpers shared by the handlers: the error type, JSON and CSV responses, body
 * reading and input checks. Nothing here reads request headers other than Authorization and
 * Content-Length, and nothing is logged.
 */
import type { ApiErrorBody, ApiErrorCode } from '../shared/api';
import { MAX_BODY_BYTES } from './config';
import type { Db } from './db';
import type { Env } from './env';

/** What every handler gets. The clock is injected so tests control time. */
export interface Deps {
  db: Db;
  env: Env;
  now: () => Date;
}

/** Thrown by handlers. The router turns it into an ApiErrorBody with the given status. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function invalid(message: string, details?: Record<string, unknown>): ApiError {
  return new ApiError(400, 'invalid_request', message, details);
}

const NO_STORE = { 'cache-control': 'no-store' } as const;

export function json<T>(body: T, status = 200): Response {
  return Response.json(body, { status, headers: NO_STORE });
}

export function errorResponse(error: ApiError): Response {
  const body: ApiErrorBody = {
    error: { code: error.code, message: error.message, ...(error.details ? { details: error.details } : {}) },
  };
  return json(body, error.status);
}

/** The bearer token of the request, or null. */
export function bearer(request: Request): string | null {
  const header = request.headers.get('authorization');
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : null;
}

/** Reads and parses a JSON object body. An empty body reads as {}. */
export async function readBody(request: Request): Promise<Record<string, unknown>> {
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (declared > MAX_BODY_BYTES) throw new ApiError(413, 'payload_too_large', 'request body is too large');
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) throw new ApiError(413, 'payload_too_large', 'request body is too large');
  if (text.trim() === '') return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ApiError(400, 'invalid_json', 'request body is not valid JSON');
  }
  if (!isRecord(parsed)) throw new ApiError(400, 'invalid_json', 'request body must be a JSON object');
  return parsed;
}

// ---------------------------------------------------------------- input checks

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isOneOf<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value);
}

export function isInt(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** True for a real calendar date written YYYY-MM-DD. */
export function isDay(value: unknown): value is string {
  if (typeof value !== 'string' || !DAY.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** UTC date of a moment, YYYY-MM-DD. */
export function utcDay(at: Date): string {
  return at.toISOString().slice(0, 10);
}

/** Whole days from day a to day b (b minus a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00.000Z`) - Date.parse(`${a}T00:00:00.000Z`)) / 86_400_000);
}

// ---------------------------------------------------------------- CSV

export type CsvCell = string | number | boolean | null | undefined;

function csvCell(value: CsvCell): string {
  if (value === null || value === undefined) return '';
  const text = typeof value === 'number' ? String(value) : typeof value === 'boolean' ? (value ? 'true' : 'false') : value;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** RFC 4180 text: a header line and one line per row, CRLF line ends. */
export function toCsv(header: readonly string[], rows: ReadonlyArray<readonly CsvCell[]>): string {
  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

export function csv(name: string, header: readonly string[], rows: ReadonlyArray<readonly CsvCell[]>): Response {
  return new Response(toCsv(header, rows), {
    status: 200,
    headers: {
      ...NO_STORE,
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${name}.csv"`,
    },
  });
}
