const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ALLOWED_MANAGED_ROLE_VALUES = new Set([
  "MAIN_ADMIN",
  "L1",
  "L2",
  "admin",
  "superadmin",
  "owner",
  "manager",
  "l1",
  "l2",
]);
const ALLOWED_CUSTOM_FIELD_TYPES = new Set(["text", "number", "list"]);
const ALLOWED_BOOLEAN_STRINGS = new Set(["true", "false"]);

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

export function cleanRequiredString(value, fieldName, maxLength = 255) {
  const cleaned = cleanOptionalString(value);
  if (!cleaned) {
    throw new Error(`${fieldName} is required`);
  }
  if (cleaned.length > maxLength) {
    throw new Error(`${fieldName} must be ${maxLength} characters or fewer`);
  }
  return cleaned;
}

export function cleanOptionalLimitedString(value, maxLength = 255) {
  const cleaned = cleanOptionalString(value);
  if (!cleaned) return null;
  if (cleaned.length > maxLength) {
    throw new Error(`Value must be ${maxLength} characters or fewer`);
  }
  return cleaned;
}

export function normalizeStringArray(value, maxItems = 100) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => cleanOptionalString(item))
    .filter(Boolean)
    .slice(0, maxItems);
}

export function parseStrictBoolean(value, fieldName = "Boolean field") {
  if (typeof value === "boolean") return value;
  if (typeof value === "string" && ALLOWED_BOOLEAN_STRINGS.has(value.toLowerCase())) {
    return value.toLowerCase() === "true";
  }
  throw new Error(`${fieldName} must be true or false`);
}

export function validateManagedUserPayload(body = {}, options = {}) {
  const { requirePassword = false, allowPartialPassword = false } = options;
  const username = cleanRequiredString(body.username, "Username", 80);
  const firstName = cleanRequiredString(body.firstName, "First name", 100);
  const lastName = cleanRequiredString(body.lastName, "Last name", 100);
  const email = normalizeEmail(body.email);

  if (!isValidEmail(email)) {
    throw new Error("A valid email address is required");
  }

  if (!ALLOWED_MANAGED_ROLE_VALUES.has(String(body.role || "").trim())) {
    throw new Error("A valid role is required");
  }

  const payload = {
    username,
    firstName,
    lastName,
    email,
    role: String(body.role).trim(),
    isActive: parseStrictBoolean(body.isActive ?? body.is_active ?? true, "Active status"),
  };

  const password = body.password == null ? null : String(body.password);
  if (requirePassword || (allowPartialPassword && password)) {
    if (!isStrongPassword(password)) {
      throw new Error(
        "Password must be at least 8 characters and include upper, lower, number, and special character"
      );
    }
    payload.password = password;
  }

  if (requirePassword && !payload.password) {
    throw new Error("Password is required");
  }

  return payload;
}

export function validateListPayload(body = {}, options = {}) {
  const { requireOwner = false } = options;
  const name = cleanRequiredString(body.name, "List name", 150);
  const description = cleanOptionalLimitedString(body.description, 1000);
  const subject = cleanOptionalLimitedString(body.subject, 150);
  const listOwner = cleanOptionalString(body.list_owner);

  if (requireOwner && !listOwner) {
    throw new Error("List owner is required");
  }

  return {
    name,
    description,
    subject,
    list_owner: listOwner,
  };
}

export function validateCompanyProfilePayload(body = {}) {
  const primaryContactInput = body.primaryContact || {};
  const brandingInput = body.branding || {};
  const localeInput = body.locale || {};
  const accountSettingsInput = body.accountSettings || {};

  const primaryContact = {
    firstName: cleanRequiredString(primaryContactInput.firstName, "Primary contact first name", 100),
    lastName: cleanRequiredString(primaryContactInput.lastName, "Primary contact last name", 100),
    designation: cleanOptionalLimitedString(primaryContactInput.designation, 150),
    email: normalizeEmail(primaryContactInput.email),
    phone: cleanOptionalLimitedString(primaryContactInput.phone, 30),
    orgName: cleanRequiredString(primaryContactInput.orgName, "Organization name", 180),
    address1: cleanOptionalLimitedString(primaryContactInput.address1, 255),
    address2: cleanOptionalLimitedString(primaryContactInput.address2, 255),
    city: cleanOptionalLimitedString(primaryContactInput.city, 120),
    state: cleanOptionalLimitedString(primaryContactInput.state, 120),
    country: cleanOptionalLimitedString(primaryContactInput.country, 120),
    zip: cleanOptionalLimitedString(primaryContactInput.zip, 30),
    gstin: cleanOptionalLimitedString(primaryContactInput.gstin, 40),
  };

  if (!isValidEmail(primaryContact.email)) {
    throw new Error("Primary contact email is invalid");
  }

  const branding = {
    mobileLogoUrl: cleanOptionalLimitedString(brandingInput.mobileLogoUrl, 2048),
    webLogoUrl: cleanOptionalLimitedString(brandingInput.webLogoUrl, 2048),
  };

  const locale = {
    currency: cleanOptionalLimitedString(localeInput.currency, 100) || "INR - Indian Rupee",
    timezone: cleanOptionalLimitedString(localeInput.timezone, 100) || "Asia/Kolkata",
  };

  const accountSettings = {
    autoDuplicateCheck: coerceBoolean(accountSettingsInput.autoDuplicateCheck),
  };

  return {
    primaryContact,
    branding,
    locale,
    accountSettings,
    salesOrgConfigured: coerceBoolean(body.salesOrgConfigured),
  };
}

export function validateCustomFieldPayload(body = {}) {
  const type = cleanRequiredString(body.type, "Field type", 30).toLowerCase();
  if (!ALLOWED_CUSTOM_FIELD_TYPES.has(type)) {
    throw new Error("Field type must be text, number, or list");
  }

  const values = Array.isArray(body.values)
    ? normalizeStringArray(body.values, 100)
    : String(body.values || "")
        .split(/\r?\n|,/)
        .map((item) => cleanOptionalString(item))
        .filter(Boolean)
        .slice(0, 100);

  return {
    name: cleanRequiredString(body.name, "Field name", 150),
    type,
    values,
    mandatory: coerceBoolean(body.mandatory),
    lists: normalizeStringArray(body.lists, 100),
  };
}

export function validatePropertyFilters(query = {}) {
  const filters = {};

  if (isNonEmptyString(query.search)) filters.search = query.search.trim();
  if (isNonEmptyString(query.location)) filters.location = query.location.trim();
  if (isNonEmptyString(query.type)) filters.type = query.type.trim().toLowerCase();

  const beds = parseInteger(query.beds);
  if (beds !== null) {
    if (beds < 0) throw new Error("Beds must be zero or greater");
    filters.beds = beds;
  }

  const baths = parseInteger(query.baths);
  if (baths !== null) {
    if (baths < 0) throw new Error("Baths must be zero or greater");
    filters.baths = baths;
  }

  const minSqft = parseInteger(query.minSqft);
  if (minSqft !== null) {
    if (minSqft < 0) throw new Error("Minimum sqft must be zero or greater");
    filters.minSqft = minSqft;
  }

  const maxSqft = parseInteger(query.maxSqft);
  if (maxSqft !== null) {
    if (maxSqft < 0) throw new Error("Maximum sqft must be zero or greater");
    filters.maxSqft = maxSqft;
  }

  const minPrice = parseNumber(query.minPrice);
  if (minPrice !== null) {
    if (minPrice < 0) throw new Error("Minimum price must be zero or greater");
    filters.minPrice = minPrice;
  }

  const maxPrice = parseNumber(query.maxPrice);
  if (maxPrice !== null) {
    if (maxPrice < 0) throw new Error("Maximum price must be zero or greater");
    filters.maxPrice = maxPrice;
  }

  if (query.sale !== undefined && query.sale !== "") {
    filters.sale = coerceBoolean(query.sale);
  }

  return filters;
}

export function badRequest(res, message, details) {
  return res.status(400).json({
    success: false,
    message,
    ...(details ? { details } : {}),
  });
}
