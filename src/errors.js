export class GatewayError extends Error {
  constructor(code, message, details) { super(message); this.name = "GatewayError"; this.code = code; this.details = details; }
}
export function safeError(error) {
  if (error instanceof GatewayError) return { ok:false, error:{ code:error.code, message:error.message, details:error.details } };
  return { ok:false, error:{ code:"INTERNAL_ERROR", message:"Gateway operation failed" } };
}
