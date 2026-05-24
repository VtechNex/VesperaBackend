import bcrypt from "bcrypt";
import pool from "../db/pool.js";
import {
  badRequest,
  cleanOptionalString,
  coerceBoolean,
  isNonEmptyString,
  isStrongPassword,
  isValidEmail,
  normalizeEmail,
} from "../utils/validation.js";
import { normalizeUserRole } from "../middleware/security.js";

function mapUser(row) {
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    role: normalizeUserRole(row.role),
    rawRole: row.role,
    is_active: row.is_active,
    firstName: row.first_name || "",
    lastName: row.last_name || "",
    designation: row.designation || "",
    organization: row.organization || "",
    website: row.website || "",
    mobile: row.mobile || "",
    telephoneDirect: row.telephone_direct || "",
    telephoneOffice: row.telephone_office || "",
    address1: row.address1 || "",
    address2: row.address2 || "",
    city: row.city || "",
    state: row.state || "",
    zip: row.zip || "",
    country: row.country || "",
    facebook: row.facebook || "",
    twitter: row.twitter || "",
    linkedin: row.linkedin || "",
    instagram: row.instagram || "",
    personalUrl: row.personal_url || "",
    preferences: row.preferences || {},
  };
}

export async function getCurrentUser(req, res) {
  try {
    const result = await pool.query(
      `SELECT id, username, email, role, is_active, first_name, last_name, designation, organization,
              website, mobile, telephone_direct, telephone_office, address1, address2, city, state,
              zip, country, facebook, twitter, linkedin, instagram, personal_url, preferences
       FROM users
       WHERE id = $1
       LIMIT 1`,
      [req.user.id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    return res.json({ success: true, data: mapUser(result.rows[0]) });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: "Failed to fetch user profile" });
  }
}

export async function updateCurrentUser(req, res) {
  try {
    const email = normalizeEmail(req.body.email);
    if (!isNonEmptyString(req.body.firstName) || !isNonEmptyString(req.body.lastName)) {
      return badRequest(res, "First name and last name are required");
    }
    if (!isValidEmail(email)) {
      return badRequest(res, "A valid email address is required");
    }

    const result = await pool.query(
      `UPDATE users
       SET email = $1,
           first_name = $2,
           last_name = $3,
           designation = $4,
           organization = $5,
           website = $6,
           mobile = $7,
           telephone_direct = $8,
           telephone_office = $9,
           address1 = $10,
           address2 = $11,
           city = $12,
           state = $13,
           zip = $14,
           country = $15,
           facebook = $16,
           twitter = $17,
           linkedin = $18,
           instagram = $19,
           personal_url = $20,
           preferences = COALESCE($21::jsonb, preferences),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $22
       RETURNING id, username, email, role, is_active, first_name, last_name, designation, organization,
                 website, mobile, telephone_direct, telephone_office, address1, address2, city, state,
                 zip, country, facebook, twitter, linkedin, instagram, personal_url, preferences`,
      [
        email,
        req.body.firstName.trim(),
        req.body.lastName.trim(),
        cleanOptionalString(req.body.designation),
        cleanOptionalString(req.body.organization),
        cleanOptionalString(req.body.website),
        cleanOptionalString(req.body.mobile),
        cleanOptionalString(req.body.telephoneDirect),
        cleanOptionalString(req.body.telephoneOffice),
        cleanOptionalString(req.body.address1),
        cleanOptionalString(req.body.address2),
        cleanOptionalString(req.body.city),
        cleanOptionalString(req.body.state),
        cleanOptionalString(req.body.zip),
        cleanOptionalString(req.body.country),
        cleanOptionalString(req.body.facebook),
        cleanOptionalString(req.body.twitter),
        cleanOptionalString(req.body.linkedin),
        cleanOptionalString(req.body.instagram),
        cleanOptionalString(req.body.personalUrl),
        req.body.preferences || {},
        req.user.id,
      ]
    );

    return res.json({ success: true, data: mapUser(result.rows[0]) });
  } catch (error) {
    console.error(error);
    if (error.code === "23505") {
      return res.status(409).json({ success: false, message: "Email is already in use" });
    }
    return res.status(500).json({ success: false, message: "Failed to update user profile" });
  }
}

export async function changePassword(req, res) {
  try {
    const { oldPassword, newPassword, confirmPassword } = req.body;
    if (!oldPassword || !newPassword || !confirmPassword) {
      return badRequest(res, "All password fields are required");
    }
    if (newPassword !== confirmPassword) {
      return badRequest(res, "New password and confirmation do not match");
    }
    if (!isStrongPassword(newPassword)) {
      return badRequest(res, "Password must be at least 8 characters and include upper, lower, number, and special character");
    }

    const result = await pool.query(`SELECT password FROM users WHERE id = $1 LIMIT 1`, [req.user.id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const isMatch = await bcrypt.compare(oldPassword, result.rows[0].password);
    if (!isMatch) {
      return res.status(400).json({ success: false, message: "Current password is incorrect" });
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    await pool.query(`UPDATE users SET password = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`, [hashed, req.user.id]);
    return res.json({ success: true, message: "Password updated successfully" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: "Failed to update password" });
  }
}

export async function getAssignableUsers(req, res) {
  try {
    const result = await pool.query(
      `SELECT id, username, email, role, is_active
       FROM users
       WHERE is_active = TRUE
       ORDER BY username ASC`
    );

    return res.json({
      success: true,
      data: result.rows.map((row) => ({
        id: row.id,
        username: row.username,
        email: row.email,
        role: normalizeUserRole(row.role),
        is_active: row.is_active,
      })),
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: "Failed to fetch assignable users" });
  }
}

const defaultCompanyProfile = {
  primaryContact: {},
  branding: {},
  locale: {},
  accountSettings: {},
  salesOrgConfigured: false,
};

export async function getCompanyProfile(req, res) {
  try {
    const result = await pool.query(
      `SELECT primary_contact, branding, locale, account_settings, sales_org_configured
       FROM company_profiles
       WHERE user_id = $1`,
      [req.user.id]
    );

    if (result.rowCount === 0) {
      return res.json({ success: true, data: defaultCompanyProfile });
    }

    const row = result.rows[0];
    return res.json({
      success: true,
      data: {
        primaryContact: row.primary_contact || {},
        branding: row.branding || {},
        locale: row.locale || {},
        accountSettings: row.account_settings || {},
        salesOrgConfigured: row.sales_org_configured || false,
      },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: "Failed to fetch company profile" });
  }
}

export async function upsertCompanyProfile(req, res) {
  try {
    const primaryContact = req.body.primaryContact || {};
    const branding = req.body.branding || {};
    const locale = req.body.locale || {};
    const accountSettings = req.body.accountSettings || {};
    const salesOrgConfigured = coerceBoolean(req.body.salesOrgConfigured);

    if (!isNonEmptyString(primaryContact.firstName) || !isNonEmptyString(primaryContact.lastName)) {
      return badRequest(res, "Primary contact first name and last name are required");
    }
    if (!isValidEmail(primaryContact.email)) {
      return badRequest(res, "Primary contact email is invalid");
    }
    if (!isNonEmptyString(primaryContact.orgName)) {
      return badRequest(res, "Organization name is required");
    }

    const result = await pool.query(
      `INSERT INTO company_profiles (
         user_id, primary_contact, branding, locale, account_settings, sales_org_configured
       ) VALUES ($1, $2::jsonb, $3::jsonb, $4::jsonb, $5::jsonb, $6)
       ON CONFLICT (user_id) DO UPDATE SET
         primary_contact = EXCLUDED.primary_contact,
         branding = EXCLUDED.branding,
         locale = EXCLUDED.locale,
         account_settings = EXCLUDED.account_settings,
         sales_org_configured = EXCLUDED.sales_org_configured,
         updated_at = CURRENT_TIMESTAMP
       RETURNING primary_contact, branding, locale, account_settings, sales_org_configured`,
      [req.user.id, primaryContact, branding, locale, accountSettings, salesOrgConfigured]
    );

    const row = result.rows[0];
    return res.json({
      success: true,
      data: {
        primaryContact: row.primary_contact,
        branding: row.branding,
        locale: row.locale,
        accountSettings: row.account_settings,
        salesOrgConfigured: row.sales_org_configured,
      },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: "Failed to save company profile" });
  }
}

export async function getCustomFields(req, res) {
  try {
    const result = await pool.query(
      `SELECT id, name, type, values, mandatory, lists, created_at, updated_at
       FROM custom_fields
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [req.user.id]
    );

    return res.json({
      success: true,
      data: result.rows.map((row) => ({
        id: row.id,
        name: row.name,
        type: row.type,
        values: Array.isArray(row.values) ? row.values : [],
        mandatory: row.mandatory,
        lists: row.lists || [],
        created_at: row.created_at,
        updated_at: row.updated_at,
      })),
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: "Failed to fetch custom fields" });
  }
}

function normalizeCustomFieldPayload(body) {
  const values = Array.isArray(body.values)
    ? body.values
    : String(body.values || "")
        .split(/\r?\n|,/)
        .map((item) => item.trim())
        .filter(Boolean);

  return {
    name: cleanOptionalString(body.name),
    type: cleanOptionalString(body.type),
    values,
    mandatory: coerceBoolean(body.mandatory),
    lists: Array.isArray(body.lists) ? body.lists.filter(Boolean) : [],
  };
}

export async function createCustomField(req, res) {
  try {
    const payload = normalizeCustomFieldPayload(req.body);
    if (!payload.name || !payload.type) {
      return badRequest(res, "Field name and type are required");
    }

    const result = await pool.query(
      `INSERT INTO custom_fields (user_id, name, type, values, mandatory, lists)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6)
       RETURNING id, name, type, values, mandatory, lists, created_at, updated_at`,
      [req.user.id, payload.name, payload.type, JSON.stringify(payload.values), payload.mandatory, payload.lists]
    );

    return res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error(error);
    if (error.code === "23505") {
      return res.status(409).json({ success: false, message: "A custom field with this name already exists" });
    }
    return res.status(500).json({ success: false, message: "Failed to create custom field" });
  }
}

export async function updateCustomField(req, res) {
  try {
    const payload = normalizeCustomFieldPayload(req.body);
    if (!payload.name || !payload.type) {
      return badRequest(res, "Field name and type are required");
    }

    const result = await pool.query(
      `UPDATE custom_fields
       SET name = $1,
           type = $2,
           values = $3::jsonb,
           mandatory = $4,
           lists = $5,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $6 AND user_id = $7
       RETURNING id, name, type, values, mandatory, lists, created_at, updated_at`,
      [payload.name, payload.type, JSON.stringify(payload.values), payload.mandatory, payload.lists, req.params.id, req.user.id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: "Custom field not found" });
    }

    return res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error(error);
    if (error.code === "23505") {
      return res.status(409).json({ success: false, message: "A custom field with this name already exists" });
    }
    return res.status(500).json({ success: false, message: "Failed to update custom field" });
  }
}

export async function deleteCustomField(req, res) {
  try {
    const result = await pool.query(
      `DELETE FROM custom_fields WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user.id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: "Custom field not found" });
    }

    return res.json({ success: true, message: "Custom field deleted successfully" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: "Failed to delete custom field" });
  }
}
