import pool from "../db/pool.js";

async function getProperties(
    page = 1,
    limit = 20,
    filters = {}
) {

    const offset = (page - 1) * limit;

    let baseQuery = "FROM properties";
    const conditions = [];
    const values = [];
    let index = 1;

    // 🔎 Search (title, description, location)
    if (filters.search) {
        conditions.push(`(
            title ILIKE $${index} OR 
            description ILIKE $${index} OR 
            location ILIKE $${index}
        )`);
        values.push(`%${filters.search}%`);
        index++;
    }

    // Beds
    if (filters.beds !== undefined) {
        conditions.push(`beds >= $${index}`);
        values.push(filters.beds);
        index++;
    }

    // Baths
    if (filters.baths !== undefined) {
        conditions.push(`baths >= $${index}`);
        values.push(filters.baths);
        index++;
    }

    // Sqft
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

    // Price
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

    // Type
    if (filters.type) {
        conditions.push(`type = $${index}`);
        values.push(filters.type);
        index++;
    }

    // Sale
    if (filters.sale !== undefined) {
        conditions.push(`sale = $${index}`);
        values.push(filters.sale);
        index++;
    }

    // Build WHERE clause
    if (conditions.length > 0) {
        baseQuery += " WHERE " + conditions.join(" AND ");
    }

    // 🔢 Total count query
    const countQuery = `SELECT COUNT(*) ${baseQuery}`;
    const countResult = await pool.query(countQuery, values);
    const totalCount = parseInt(countResult.rows[0].count);

    // 📦 Data query
    const dataQuery = `
        SELECT * 
        ${baseQuery}
        ORDER BY created_at DESC
        LIMIT $${index} OFFSET $${index + 1}
    `;

    const dataValues = [...values, limit, offset];

    const { rows } = await pool.query(dataQuery, dataValues);

    return {
        data: rows,
        pagination: {
            totalCount,
            totalPages: Math.ceil(totalCount / limit),
            currentPage: page,
            limit
        }
    };
}

async function getPropertyById(id) {
    const { rows } = await pool.query("SELECT * FROM properties WHERE id = $1", [id]);
    return rows[0];
}

async function createProperty(property) {
    const { title, description, price, location, images, type, beds, baths, sqft, tags, sale } = property;
    const { rows } = await pool.query(
        "INSERT INTO properties (title, description, price, location, images, type, beds, baths, sqft, tags, sale) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *",
        [title, description, price, location, images, type.toLowerCase(), beds || null, baths || null, sqft || null, tags || [], sale]
    );
    return rows[0];
}

async function updateProperty(id, property) {
    const { title, description, price, location, images, type, beds, baths, sqft, tags, sale } = property;
    const { rows } = await pool.query(
        "UPDATE properties SET title = $1, description = $2, price = $3, location = $4, images = $5, type = $6, beds = $7, baths = $8, sqft = $9, tags = $10, sale = $11 WHERE id = $12 RETURNING *",
        [title, description, price, location, images, type || null, beds || null, baths || null, sqft || null, tags || [], sale || null, id]
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
    getProperties
}
