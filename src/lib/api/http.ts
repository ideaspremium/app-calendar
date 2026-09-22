import { randomUUID } from "crypto";
import { NextResponse } from "next/server";

/**
 * Códigos de error de la API v1. Son contrato: el agente decide qué hacer según el
 * código, nunca según el texto. Añadir códigos es compatible; cambiar uno no.
 */
export const ERROR_STATUS = {
  unauthorized: 401,
  invalid_request: 400,
  invalid_datetime: 400,
  idempotency_key_required: 400,
  calendar_not_found: 404,
  service_not_found: 404,
  booking_not_found: 404,
  service_required: 422,
  service_not_bookable: 409,
  calendar_disconnected: 409,
  invalid_duration: 422,
  missing_required_fields: 422,
  outside_hours: 422,
  too_soon: 422,
  too_far_ahead: 422,
  too_late_to_change: 422,
  slot_taken: 409,
  booking_cancelled: 409,
  idempotency_key_reused: 422,
  request_in_progress: 409,
  provider_error: 502,
  internal_error: 500,
} as const;

export type ErrorCode = keyof typeof ERROR_STATUS;

/** Errores que tiene sentido reintentar tal cual, pasado un momento. */
const RETRYABLE: ErrorCode[] = ["request_in_progress", "internal_error"];

export class ApiError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly extra: {
      details?: Record<string, unknown>;
      alternatives?: unknown[];
      retryable?: boolean;
      retryAfterSeconds?: number;
    } = {}
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export type Ctx = { requestId: string };

const baseHeaders = (requestId: string) => ({
  "X-Request-Id": requestId,
  "Cache-Control": "no-store",
});

export function json(ctx: Ctx, body: unknown, status = 200, headers: Record<string, string> = {}) {
  return NextResponse.json(body, { status, headers: { ...baseHeaders(ctx.requestId), ...headers } });
}

function errorResponse(ctx: Ctx, err: ApiError) {
  const { details, alternatives, retryAfterSeconds } = err.extra;
  const retryable = err.extra.retryable ?? RETRYABLE.includes(err.code);
  const body = {
    error: {
      code: err.code,
      message: err.message,
      retryable,
      ...(details ? { details } : {}),
      ...(alternatives ? { alternatives } : {}),
    },
    request_id: ctx.requestId,
  };
  const headers: Record<string, string> = retryAfterSeconds ? { "Retry-After": String(retryAfterSeconds) } : {};
  return json(ctx, body, ERROR_STATUS[err.code], headers);
}

/**
 * Envuelve un manejador: da un request_id, convierte ApiError en respuesta con código
 * y cualquier otro fallo en internal_error sin filtrar detalles internos.
 */
export function handler<P>(fn: (req: Request, ctx: Ctx, params: P) => Promise<Response>) {
  return async (req: Request, route: { params: Promise<P> }) => {
    const ctx: Ctx = { requestId: req.headers.get("x-request-id")?.slice(0, 100) || randomUUID() };
    const started = Date.now();
    try {
      const params = (await route.params) as P;
      const res = await fn(req, ctx, params);
      console.log(`[api] ${req.method} ${new URL(req.url).pathname} ${res.status} ${Date.now() - started}ms`);
      return res;
    } catch (e) {
      if (e instanceof ApiError) {
        console.log(`[api] ${req.method} ${new URL(req.url).pathname} ${e.code} ${Date.now() - started}ms`);
        return errorResponse(ctx, e);
      }
      console.error(`[api] ${req.method} ${new URL(req.url).pathname} error interno (${ctx.requestId}):`, e);
      return errorResponse(ctx, new ApiError("internal_error", "Error interno. Reintenta; si persiste, avisa con el request_id."));
    }
  };
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  const text = await req.text();
  if (!text.trim()) return {};
  try {
    const v = JSON.parse(text);
    if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error("no es un objeto");
    return v as Record<string, unknown>;
  } catch {
    throw new ApiError("invalid_request", "El cuerpo debe ser un objeto JSON válido.");
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

/** Cadena opcional con límite de longitud; vacía cuenta como ausente. */
export function optString(body: Record<string, unknown>, field: string, max: number, label = field): string | null {
  const v = body[field];
  if (v === undefined || v === null || v === "") return null;
  if (typeof v !== "string") throw new ApiError("invalid_request", `«${label}» debe ser texto.`, { details: { field: label } });
  const t = v.trim();
  if (t.length > max) {
    throw new ApiError("invalid_request", `«${label}» supera ${max} caracteres.`, { details: { field: label } });
  }
  return t || null;
}
