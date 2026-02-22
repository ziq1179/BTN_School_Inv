/**
 * Role hierarchy: ADMIN > MANAGER > STAFF > VIEWER
 * ADMIN: full access, user management
 * MANAGER: manage inventory, categories, transactions, reports
 * STAFF: add stock, record sales, view inventory
 * VIEWER: read-only (dashboard, items, categories, transactions - no POST/PUT/DELETE)
 */

export const ROLES = Object.freeze({
    ADMIN: 'ADMIN',
    MANAGER: 'MANAGER',
    STAFF: 'STAFF',
    VIEWER: 'VIEWER',
});

const ROLE_LEVEL = { ADMIN: 4, MANAGER: 3, STAFF: 2, VIEWER: 1 };

export function requireAuth(req, res, next) {
    if (!req.session?.userId) {
        return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    next();
}

export function requireRole(...allowedRoles) {
    return (req, res, next) => {
        if (!req.session?.userId) {
            return res.status(401).json({ success: false, error: 'Authentication required' });
        }
        const userRole = req.session.role || ROLES.VIEWER;
        if (!allowedRoles.includes(userRole)) {
            return res.status(403).json({ success: false, error: 'Insufficient permissions' });
        }
        next();
    };
}

/** Require at least this role level (e.g. minRole(ROLES.MANAGER) allows MANAGER and ADMIN) */
export function minRole(minimumRole) {
    return (req, res, next) => {
        if (!req.session?.userId) {
            return res.status(401).json({ success: false, error: 'Authentication required' });
        }
        const userRole = req.session.role || ROLES.VIEWER;
        const userLevel = ROLE_LEVEL[userRole] || 0;
        const minLevel = ROLE_LEVEL[minimumRole] || 0;
        if (userLevel < minLevel) {
            return res.status(403).json({ success: false, error: 'Insufficient permissions' });
        }
        next();
    };
}
