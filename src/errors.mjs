export class CliError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'CliError';
    this.code = code;
    this.details = details;
  }
}

export function failure(error) {
  return { ok: false, error: { code: error.code || 'INTERNAL_ERROR', message: error.message, ...(error.details || {}) } };
}
