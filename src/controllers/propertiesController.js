import pool from "../db/pool.js";
import { cleanOptionalString, parseInteger, parseNumber } from "../utils/validation.js";

function normalizePropertyPayload(property = {}) {
  return {
    title: cleanOptionalString(property.title),
    description: cleanOptionalString(property.description),
    price: parseNumber(property.price),
    location: cleanOptionalString(property.location),
    images: Array.isArray(property.images) ? property.images.filter(Boolean) : [],
    type: cleanOptionalString(property.type),
    beds: parseInteger(property.beds),
    baths: parseInteger(property.baths),
    sqft: parseInteger(property.sqft),
    tags: Array.isArray(property.tags) ? property.tags.filter(Boolean) : [],
    sale: typeof property.sale === "boolean" ? property.sale : property.sale !== "false",
  };
}

async function getProperties(page = 1, limit = 20, filters = {}) {
  const safePage = Math.max(Number(page) || 1, 1);
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const offset = (safePage - 1) * safeLimit;

  let baseQuery = "FROM properties";
  const conditions = [];
  const values = [];
  let index = 1;

  if (filters.search) {
    conditions.push(`(title ILIKE $${index} OR description ILIKE $${index} OR location ILIKE $${index})`);
    values.push(`%${filters.search}%`);
    index++;
  }

  if (filters.beds !== undefined) {
    conditions.push(`beds >= $${index}`);
    values.push(filters.beds);
    index++;
  }

  if (filters.baths !== undefined) {
    conditions.push(`baths >= $${index}`);
    values.push(filters.baths);
    index++;
  }

  if (filters.minSqft !== undefined) {
    conditions.push(`sqft >= $${index}`);
    values.push(filters.minSqft);
    index++;
  }

  if (filters.maxSqft !== undefined) {
    conditions.push(`sqft <= $${index}`);
    values.push(filters.maxSqft);
    index++;
  }

  if (filters.minPrice !== undefined) {
    conditions.push(`price >= $${index}`);
    values.push(filters.minPrice);
    index++;
  }

  if (filters.maxPrice !== undefined) {
    conditions.push(`price <= $${index}`);
    values.push(filters.maxPrice);
    index++;
  }

  if (filters.type) {
    conditions.push(`type = $${index}`);
    values.push(String(filters.type).toLowerCase());
    index++;
  }

  if (filters.sale !== undefined && filters.sale !== "") {
    conditions.push(`sale = $${index}`);
    values.push(filters.sale === true || filters.sale === "true");
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
  if (!payload.title || !payload.location || payload.price == null || !payload.type) {
    throw new Error("Title, location, type, and price are required");
  }

  const { rows } = await pool.query(
    "INSERT INTO properties (title, description, price, location, images, type, beds, baths, sqft, tags, sale) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *",
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
      payload.tags,
      payload.sale,
    ]
  );
  return rows[0];
}

async function updateProperty(id, property) {
  const payload = normalizePropertyPayload(property);
  if (!payload.title || !payload.location || payload.price == null || !payload.type) {
    throw new Error("Title, location, type, and price are required");
  }

  const { rows } = await pool.query(
    "UPDATE properties SET title = $1, description = $2, price = $3, location = $4, images = $5, type = $6, beds = $7, baths = $8, sqft = $9, tags = $10, sale = $11, updated_at = CURRENT_TIMESTAMP WHERE id = $12 RETURNING *",
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
