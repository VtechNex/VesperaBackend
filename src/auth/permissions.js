export const ROLES = {
  MAIN_ADMIN: "MAIN_ADMIN",
  MANAGER: "MANAGER",
  L1: "L1",
  L2: "L2",
};

export const PERMISSION_KEYS = [
  "canViewDashboard",
  "canViewLeads",
  "canViewLeadPhone",
  "canCreateLead",
  "canEditLead",
  "canDeleteLead",
  "canExportLeads",
  "canViewLists",
  "canCreateList",
  "canEditList",
  "canDeleteList",
  "canManageUsers",
  "canManageSettings",
  "canReadCustomFieldsForLeadForm",
  "canManageCustomFields",
  "canManageCompanyProfile",
  "canManageQualifiers",
  "canManageLeadStages",
  "canManagePropertyMedia",
];

function buildPermissionMap(value) {
  return PERMISSION_KEYS.reduce((accumulator, permissionKey) => {
    accumulator[permissionKey] = value;
    return accumulator;
  }, {});
}

export const FULL_PERMISSIONS = buildPermissionMap(true);

export const DEFAULT_ROLE_PERMISSIONS = {
  [ROLES.MAIN_ADMIN]: FULL_PERMISSIONS,
  [ROLES.MANAGER]: {
    ...FULL_PERMISSIONS,
  },
  [ROLES.L1]: {
    ...buildPermissionMap(false),
    canViewDashboard: true,
    canViewLeads: true,
    canViewLeadPhone: true,
    canCreateLead: true,
    canViewLists: true,
    canReadCustomFieldsForLeadForm: true,
  },
  [ROLES.L2]: {
    ...buildPermissionMap(false),
    canViewDashboard: true,
    canViewLeads: true,
    canViewLists: true,
  },
};

export const MANAGE_USERS_PERMISSION_KEYS = [
  "canViewDashboard",
  "canViewLeads",
  "canViewLeadPhone",
  "canCreateLead",
  "canEditLead",
  "canDeleteLead",
  "canExportLeads",
  "canViewLists",
  "canCreateList",
  "canEditList",
  "canDeleteList",
  "canManageUsers",
  "canManageSettings",
  "canManageCompanyProfile",
  "canManageQualifiers",
  "canManageLeadStages",
  "canManagePropertyMedia",
];

const LEGACY_ROLE_MAP = {
  main_admin: ROLES.MAIN_ADMIN,
  admin: ROLES.MAIN_ADMIN,
  superadmin: ROLES.MAIN_ADMIN,
  owner: ROLES.MAIN_ADMIN,
  manager: ROLES.MANAGER,
  l1: ROLES.L1,
  sales: ROLES.L2,
  marketing: ROLES.L2,
  customer: ROLES.L2,
  l2: ROLES.L2,
};

function hasOwn(objectValue, key) {
  return Object.prototype.hasOwnProperty.call(objectValue, key);
}

export function resolveKnownRole(rawRole) {
  if (rawRole == null) return null;
  const trimmedRole = String(rawRole).trim();
  if (!trimmedRole) return null;

  if (hasOwn(ROLES, trimmedRole)) {
    return ROLES[trimmedRole];
  }

  return LEGACY_ROLE_MAP[trimmedRole.toLowerCase()] || null;
}

export function normalizeUserRole(rawRole, options = {}) {
  const { fallbackRole = ROLES.L2 } = options;
  return resolveKnownRole(rawRole) || fallbackRole;
}

export function isUnknownRole(rawRole) {
  if (rawRole == null || String(rawRole).trim() === "") {
    return false;
  }
  return resolveKnownRole(rawRole) == null;
}

export function normalizePermissionRecord(rawPermissions = {}) {
  return PERMISSION_KEYS.reduce((accumulator, permissionKey) => {
    accumulator[permissionKey] = Boolean(rawPermissions?.[permissionKey]);
    return accumulator;
  }, {});
}

export function sanitizePermissionOverrides(rawPermissions = {}) {
  return PERMISSION_KEYS.reduce((accumulator, permissionKey) => {
    if (Object.prototype.hasOwnProperty.call(rawPermissions || {}, permissionKey)) {
      accumulator[permissionKey] = Boolean(rawPermissions[permissionKey]);
    }
    return accumulator;
  }, {});
}

export function areAllPermissionValuesFalse(rawPermissions = {}) {
  const sanitizedOverrides = sanitizePermissionOverrides(rawPermissions);
  const keys = Object.keys(sanitizedOverrides);
  if (!keys.length) return false;
  return keys.every((permissionKey) => sanitizedOverrides[permissionKey] === false);
}

export function getDefaultPermissionsForRole(rawRole) {
  const normalizedRole = normalizeUserRole(rawRole);
  return { ...(DEFAULT_ROLE_PERMISSIONS[normalizedRole] || buildPermissionMap(false)) };
}

export function getEffectivePermissions(userProfile = {}) {
  const normalizedRole = normalizeUserRole(userProfile?.role);

  if (normalizedRole === ROLES.MAIN_ADMIN) {
    return { ...FULL_PERMISSIONS };
  }

  if (normalizedRole === ROLES.MANAGER) {
    return { ...DEFAULT_ROLE_PERMISSIONS[ROLES.MANAGER] };
  }

  const defaultPermissions = getDefaultPermissionsForRole(normalizedRole);
  const storedPermissions = sanitizePermissionOverrides(userProfile?.permissions);

  return {
    ...defaultPermissions,
    ...storedPermissions,
  };
}

export function hasPermission(userProfile, permissionName) {
  if (!permissionName || !PERMISSION_KEYS.includes(permissionName)) {
    return false;
  }
  return Boolean(getEffectivePermissions(userProfile)?.[permissionName]);
}

export function sanitizeLeadForUser(lead, userProfile) {
  if (!lead) return lead;
  if (hasPermission(userProfile, "canViewLeadPhone")) {
    return lead;
  }

  const sanitizedLead = { ...lead };
  delete sanitizedLead.mobile;
  delete sanitizedLead.tel1;
  delete sanitizedLead.tel2;
  sanitizedLead.mobile_masked = "Restricted";
  sanitizedLead.tel1_masked = "Restricted";
  sanitizedLead.tel2_masked = "Restricted";
  return sanitizedLead;
}

export function sanitizeLeadCollectionForUser(leads = [], userProfile) {
  return Array.isArray(leads) ? leads.map((lead) => sanitizeLeadForUser(lead, userProfile)) : [];
}
