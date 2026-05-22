const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

export function normalizeEmail(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : null;
}

export function normalizePhone(value) {
  if (value == null) return null;
  const cleaned = String(value).replace(/[^\d+]/g, "").trim();
  return cleaned || null;
}

export function isValidEmail(value) {
  return isNonEmptyString(value) && EMAIL_REGEX.test(value.trim());
}

export function isStrongPassword(value) {
  if (typeof value !== "string" || value.length < 8) return false;
  return /[A-Z]/.test(value) && /[a-z]/.test(value) && /\d/.test(value) && /[^A-Za-z0-9]/.test(value);
}

export function parseInteger(value) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

export function parseNumber(value) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
}

export function coerceBoolean(value) {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return Boolean(value);
}

export function cleanOptionalString(value) {
  if (value === undefined || value === null) return null;
  const cleaned = String(value).trim();
  return cleaned.length ? cleaned : null;
}

export function badRequest(res, message, details) {
  return res.status(400).json({
    success: false,
    message,
    ...(details ? { details } : {}),
  });
}
