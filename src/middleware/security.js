import jwt from "jsonwebtoken";
import pool from "../db/pool.js";

export const ROLES = {
  MAIN_ADMIN: "MAIN_ADMIN",
  L1: "L1",
  L2: "L2",
};

export const PERMISSIONS_MATRIX = {
  [ROLES.MAIN_ADMIN]: {
    canViewDashboard: true,
    canViewLeads: true,
    canViewLeadPhone: true,
    canCreateLead: true,
    canEditLead: true,
    canDeleteLead: true,
    canExportLeads: true,
    canViewLists: true,
    canCreateList: true,
    canEditList: true,
    canDeleteList: true,
    canManageUsers: true,
    canManageSettings: true,
    canManageCompanyProfile: true,
    canManageQualifiers: true,
    canManageLeadStages: true,
    canManagePropertyMedia: true,
  },
  [ROLES.L1]: {
    canViewDashboard: true,
    canViewLeads: true,
    canViewLeadPhone: true,
    canCreateLead: true,
    canEditLead: false,
    canDeleteLead: false,
    canExportLeads: false,
    canViewLists: true,
    canCreateList: false,
    canEditList: false,
    canDeleteList: false,
    canManageUsers: false,
    canManageSettings: false,
    canManageCompanyProfile: false,
    canManageQualifiers: false,
    canManageLeadStages: false,
    canManagePropertyMedia: false,
  },
  [ROLES.L2]: {
    canViewDashboard: true,
    canViewLeads: true,
    canViewLeadPhone: false,
    canCreateLead: false,
    canEditLead: false,
    canDeleteLead: false,
    canExportLeads: false,
    canViewLists: true,
    canCreateList: false,
    canEditList: false,
    canDeleteList: false,
    canManageUsers: false,
    canManageSettings: false,
    canManageCompanyProfile: false,
    canManageQualifiers: false,
    canManageLeadStages: false,
    canManagePropertyMedia: false,
  },
};

const LEGACY_ROLE_MAP = {
  main_admin: ROLES.MAIN_ADMIN,
  admin: ROLES.MAIN_ADMIN,
  superadmin: ROLES.MAIN_ADMIN,
  owner: ROLES.MAIN_ADMIN,
  l1: ROLES.L1,
  manager: ROLES.L1,
  l2: ROLES.L2,
  sales: ROLES.L2,
  marketing: ROLES.L2,
  customer: ROLES.L2,
};

export function normalizeUserRole(rawRole) {
  if (!rawRole) return ROLES.L2;
  return LEGACY_ROLE_MAP[String(rawRole).trim().toLowerCase()] || ROLES.L2;
}

export function getPermissionsForRole(rawRole) {
  return PERMISSIONS_MATRIX[normalizeUserRole(rawRole)];
}

export function hasPermissionForRole(rawRole, permissionName) {
  const permissions = getPermissionsForRole(rawRole);
  return Boolean(permissions?.[permissionName]);
}

export function sanitizeLeadForUser(lead, user) {
  if (!lead) return lead;
  if (hasPermissionForRole(user?.role, "canViewLeadPhone")) return lead;

  const sanitizedLead = { ...lead };
  delete sanitizedLead.mobile;
  delete sanitizedLead.tel1;
  delete sanitizedLead.tel2;
  sanitizedLead.mobile_masked = "Restricted";
  sanitizedLead.tel1_masked = "Restricted";
  sanitizedLead.tel2_masked = "Restricted";
  return sanitizedLead;
}

export function sanitizeLeadCollectionForUser(leads = [], user) {
  return Array.isArray(leads) ? leads.map((lead) => sanitizeLeadForUser(lead, user)) : [];
}

export const authMiddleware = (req, res, next) => {
  const JWT_SECRET = process.env.JWT_SECRET;
  (async () => {
    try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const token = authHeader.split(" ")[1];

    if (!JWT_SECRET) {
      throw new Error("JWT_SECRET not configured");
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const userResult = await pool.query(
      `SELECT id, email, role, is_active, username, first_name, last_name
       FROM users
       WHERE id = $1
       LIMIT 1`,
      [decoded.id]
    );

    if (userResult.rowCount === 0) {
      return res.status(401).json({ error: "User no longer exists" });
    }

    const dbUser = userResult.rows[0];
    if (dbUser.is_active === false) {
      return res.status(403).json({ error: "Your account is inactive" });
    }

    const canonicalRole = normalizeUserRole(dbUser.role);
    req.user = {
      id: dbUser.id,
      email: dbUser.email,
      role: canonicalRole,
      rawRole: dbUser.role,
      username: dbUser.username,
      name: [dbUser.first_name, dbUser.last_name].filter(Boolean).join(" ").trim() || dbUser.username,
      permissions: getPermissionsForRole(canonicalRole),
    };

    next();
  } catch (err) {
    console.error("Auth error:", err.message);
    return res.status(401).json({ error: "Invalid or expired token" });
  }
  })();
};

export const requireRole = (role) => {
  return (req, res, next) => {
    if (normalizeUserRole(req.user?.role) !== normalizeUserRole(role)) {
      return res.status(403).json({ error: "Access denied" });
    }
    next();
  };
};

export const requirePermission = (permissionName) => {
  return (req, res, next) => {
    if (!hasPermissionForRole(req.user?.role, permissionName)) {
      return res.status(403).json({ error: "Access denied" });
    }
    next();
  };
};
