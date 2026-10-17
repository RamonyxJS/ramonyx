export interface HttpErrorOptions {
  readonly expose?: boolean;
  readonly details?: unknown;
  readonly cause?: unknown;
}

/**
 * Error HTTP yang aman: status + pesan yang boleh dilihat klien (4xx secara default),
 * sedangkan detail internal (5xx) tidak pernah masuk ke response.
 */
export class HttpError extends Error {
  readonly status: number;
  readonly expose: boolean;
  readonly details: unknown;

  constructor(status: number, message: string, options: HttpErrorOptions = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "HttpError";
    this.status = status;
    this.expose = options.expose ?? status < 500;
    this.details = options.details;
  }

  toResponse(): Response {
    const payload: Record<string, unknown> = this.expose
      ? { error: this.message }
      : { error: "Internal Server Error" };
    if (this.expose && this.details !== undefined) {
      payload.details = this.details;
    }
    return Response.json(payload, { status: this.status });
  }
}
