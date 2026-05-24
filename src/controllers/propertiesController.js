import pool from "../db/pool.js";
import { cleanOptionalString, parseInteger, parseNumber, validatePropertyFilters } from "../utils/validation.js";

function getPropertyCategory(type) {
  const normalized = String(type || "").trim().toLowerCase();
  if (["commercial", "office", "shop", "showroom"].includes(normalized)) return "commercial";
  if (["land", "plot", "farm land", "agricultural"].includes(normalized)) return "land";
  return "residential";
}

function sanitizeYesNo(value) {
  if (value === "Yes" || value === "No") return value;
  return "";
}

function normalizePropertyDetails(type, propertyDetails = {}, legacy = {}) {
  const category = getPropertyCategory(type);

  if (category === "commercial") {
    return {
      sqft: parseInteger(propertyDetails.sqft ?? legacy.sqft),
      floor: parseInteger(propertyDetails.floor),
      washroomAvailable: sanitizeYesNo(propertyDetails.washroomAvailable),
      furnishingStatus: cleanOptionalString(propertyDetails.furnishingStatus),
    };
  }

  if (category === "land") {
    return {
      landArea: parseNumber(propertyDetails.landArea ?? legacy.sqft),
      areaUnit: cleanOptionalString(propertyDetails.areaUnit) || (legacy.sqft ? "Sqft" : "Guntha"),
      roadTouch: sanitizeYesNo(propertyDetails.roadTouch),
      naPlot: sanitizeYesNo(propertyDetails.naPlot),
    };
  }

  return {
    rooms: parseInteger(propertyDetails.rooms ?? legacy.beds),
    washrooms: parseInteger(propertyDetails.washrooms ?? legacy.baths),
    carpetArea: parseNumber(propertyDetails.carpetArea ?? legacy.sqft),
    builtUpArea: parseNumber(propertyDetails.builtUpArea),
    floor: parseInteger(propertyDetails.floor),
    totalFloors: parseInteger(propertyDetails.totalFloors),
  };
}

function normalizePropertyPayload(property = {}) {
  const type = cleanOptionalString(property.type);
  const propertyDetails = normalizePropertyDetails(type, property.propertyDetails ?? property.property_details, {
    beds: property.beds,
    baths: property.baths,
    sqft: property.sqft,
  });
  const category = getPropertyCategory(type);

  let beds = null;
  let baths = null;
  let sqft = null;

  if (category === "residential") {
    beds = propertyDetails.rooms ?? parseInteger(property.beds);
    baths = propertyDetails.washrooms ?? parseInteger(property.baths);
    sqft = propertyDetails.carpetArea ?? parseInteger(property.sqft);
  } else if (category === "commercial") {
    beds = null;
    baths = propertyDetails.washroomAvailable === "Yes" ? 1 : null;
    sqft = propertyDetails.sqft ?? parseInteger(property.sqft);
  } else {
    beds = null;
    baths = null;
    sqft =
      String(propertyDetails.areaUnit || "").toLowerCase() === "sqft"
        ? parseInteger(propertyDetails.landArea)
        : parseInteger(property.sqft);
  }

  return {
    title: cleanOptionalString(property.title),
    description: cleanOptionalString(property.description),
    price: parseNumber(property.price),
    location: cleanOptionalString(property.location),
    images: Array.isArray(property.images) ? property.images.filter(Boolean) : [],
    type,
    propertyDetails,
    beds,
    baths,
    sqft,
    tags: Array.isArray(property.tags) ? property.tags.filter(Boolean) : [],
    sale: typeof property.sale === "boolean" ? property.sale : property.sale !== "false",
  };
}

function validatePropertyPayload(payload) {
  if (!payload.title || !payload.location || payload.price == null || !payload.type) {
    throw new Error("Title, location, type, and price are required");
  }
  if (payload.price < 0) {
    throw new Error("Price must be zero or greater");
  }

  const category = getPropertyCategory(payload.type);
  const details = payload.propertyDetails || {};

  if (category === "residential") {
    if (!details.rooms || details.rooms < 0) throw new Error("Rooms / BHK is required");
    if (!details.carpetArea || details.carpetArea < 0) throw new Error("Carpet Area is required");
  }

  if (category === "commercial") {
    if (!details.sqft || details.sqft < 0) throw new Error("Sqft is required");
  }

  if (category === "land") {
    if (!details.landArea || details.landArea < 0) throw new Error("Land Area is required");
    if (!details.areaUnit) throw new Error("Area Unit is required");
  }
}

async function getProperties(page = 1, limit = 20, filters = {}) {
  const safePage = Math.max(Number(page) || 1, 1);
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const offset = (safePage - 1) * safeLimit;
  const normalizedFilters = validatePropertyFilters(filters);

  let baseQuery = "FROM properties";
  const conditions = [];
  const values = [];
  let index = 1;

  if (normalizedFilters.search) {
    conditions.push(`(title ILIKE $${index} OR description ILIKE $${index} OR location ILIKE $${index})`);
    values.push(`%${normalizedFilters.search}%`);
    index++;
  }

  if (normalizedFilters.location) {
    conditions.push(`location ILIKE $${index}`);
    values.push(`%${normalizedFilters.location}%`);
    index++;
  }

  if (normalizedFilters.beds !== undefined) {
    conditions.push(`beds >= $${index}`);
    values.push(normalizedFilters.beds);
    index++;
  }

  if (normalizedFilters.baths !== undefined) {
    conditions.push(`baths >= $${index}`);
    values.push(normalizedFilters.baths);
    index++;
  }

  if (normalizedFilters.minSqft !== undefined) {
    conditions.push(`sqft >= $${index}`);
    values.push(normalizedFilters.minSqft);
    index++;
  }

  if (normalizedFilters.maxSqft !== undefined) {
    conditions.push(`sqft <= $${index}`);
    values.push(normalizedFilters.maxSqft);
    index++;
  }

  if (normalizedFilters.minPrice !== undefined) {
    conditions.push(`price >= $${index}`);
    values.push(normalizedFilters.minPrice);
    index++;
  }

  if (normalizedFilters.maxPrice !== undefined) {
    conditions.push(`price <= $${index}`);
    values.push(normalizedFilters.maxPrice);
    index++;
  }

  if (normalizedFilters.type) {
    conditions.push(`type = $${index}`);
    values.push(String(normalizedFilters.type).toLowerCase());
    index++;
  }

  if (normalizedFilters.sale !== undefined && normalizedFilters.sale !== "") {
    conditions.push(`sale = $${index}`);
    values.push(normalizedFilters.sale === true || normalizedFilters.sale === "true");
    index++;
  }

  if (conditions.length > 0) {
    baseQuery += " WHERE " + conditions.join(" AND ");
  }

  const countQuery = `SELECT COUNT(*) ${baseQuery}`;
  const countResult = await pool.query(countQuery, values);
  const totalCount = Number.parseInt(countResult.rows[0].count, 10);

  const dataQuery = `
    SELECT *
    ${baseQuery}
    ORDER BY created_at DESC
    LIMIT $${index} OFFSET $${index + 1}
  `;

  const { rows } = await pool.query(dataQuery, [...values, safeLimit, offset]);

  return {
    data: rows,
    pagination: {
      totalCount,
      totalPages: Math.ceil(totalCount / safeLimit),
      currentPage: safePage,
      limit: safeLimit,
    },
  };
}

async function getPropertyById(id) {
  const { rows } = await pool.query("SELECT * FROM properties WHERE id = $1", [id]);
  return rows[0];
}

async function createProperty(property) {
  const payload = normalizePropertyPayload(property);
  validatePropertyPayload(payload);

  const { rows } = await pool.query(
    "INSERT INTO properties (title, description, price, location, images, type, beds, baths, sqft, property_details, tags, sale) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12) RETURNING *",
    [
      payload.title,
      payload.description,
      payload.price,
      payload.location,
      payload.images,
      payload.type.toLowerCase(),
      payload.beds,
      payload.baths,
      payload.sqft,
      JSON.stringify(payload.propertyDetails || {}),
      payload.tags,
      payload.sale,
    ]
  );
  return rows[0];
}

async function updateProperty(id, property) {
  const payload = normalizePropertyPayload(property);
  validatePropertyPayload(payload);

  const { rows } = await pool.query(
    "UPDATE properties SET title = $1, description = $2, price = $3, location = $4, images = $5, type = $6, beds = $7, baths = $8, sqft = $9, property_details = $10::jsonb, tags = $11, sale = $12, updated_at = CURRENT_TIMESTAMP WHERE id = $13 RETURNING *",
    [
      payload.title,
      payload.description,
      payload.price,
      payload.location,
      payload.images,
      payload.type.toLowerCase(),
      payload.beds,
      payload.baths,
      payload.sqft,
      JSON.stringify(payload.propertyDetails || {}),
      payload.tags,
      payload.sale,
      id,
    ]
  );
  return rows[0];
}

async function deleteProperty(id) {
  await pool.query("DELETE FROM properties WHERE id = $1", [id]);
}

export {
  getPropertyById,
  createProperty,
  updateProperty,
  deleteProperty,
  getProperties,
};
