export class TxtboxError extends Error {
  override name = "TxtboxError";
}

export class TxtboxAuthError extends TxtboxError {
  override name = "TxtboxAuthError";
}

export class TxtboxApiError extends TxtboxError {
  override name = "TxtboxApiError";
}

export class TxtboxRateLimitError extends TxtboxError {
  override name = "TxtboxRateLimitError";
  readonly retryAfter: string | null;
  constructor(message: string, retryAfter: string | null) {
    super(message);
    this.retryAfter = retryAfter;
  }
}
