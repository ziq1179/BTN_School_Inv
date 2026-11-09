import express from 'express';
import multer from 'multer';
import prisma from '../db.js';
import { requireAuth, requireRole, ROLES } from '../middleware/auth.js';

const router = express.Router();

// Logos are stored as data URLs in the School.logoPath column so they survive
// serverless deploys (Vercel's filesystem is ephemeral).
const LOGO_MIME = {
    'image/png': 'image/png',
    'image/jpeg': 'image/jpeg',
    'image/jpg': 'image/jpeg',
    'image/gif': 'image/gif',
    'image/webp': 'image/webp',
};

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
    fileFilter: (req, file, cb) => {
        if (LOGO_MIME[file.mimetype]) cb(null, true);
        else cb(new Error('Only images (PNG, JPEG, GIF, WebP) are allowed'));
    },
});

// GET /api/settings — public (for login page and app shell); scoped to this tenant
// When unauthenticated, returns default branding so the login page renders.
router.get('/', async (req, res) => {
    try {
        const tenantId = req.session?.tenantId;
        let row = null;
        if (tenantId) {
            row = await prisma.school.findUnique({ where: { tenantId } });
        }
        const name = row?.name ?? 'School Inventory';
        const logoUrl = row?.logoPath ?? '/logo.png';
        res.json({ success: true, data: { schoolName: name, logoUrl } });
    } catch (err) { console.error('Request failed:', err);
        res.status(500).json({ success: false, error: 'Something went wrong. Please try again.' });
    }
});

// PUT /api/settings — update school name (admin only)
router.put('/', requireAuth, requireRole(ROLES.ADMIN), async (req, res) => {
    try {
        const tenantId = req.session.tenantId;
        const { schoolName } = req.body;
        if (!schoolName || typeof schoolName !== 'string') {
            return res.status(400).json({ success: false, error: 'schoolName is required' });
        }
        const trimmed = schoolName.trim();
        await prisma.school.upsert({
            where: { tenantId },
            update: { name: trimmed, updatedAt: new Date() },
            create: { tenantId, name: trimmed },
        });
        const row = await prisma.school.findUnique({ where: { tenantId } });
        res.json({
            success: true,
            data: { schoolName: row.name, logoUrl: row.logoPath ?? '/logo.png' },
        });
    } catch (err) { console.error('Request failed:', err);
        res.status(500).json({ success: false, error: 'Something went wrong. Please try again.' });
    }
});

// POST /api/settings/logo — upload logo (admin only); stored as data URL in DB
router.post('/logo', requireAuth, requireRole(ROLES.ADMIN), upload.single('logo'), async (req, res) => {
    try {
        const tenantId = req.session.tenantId;
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'No file uploaded' });
        }
        const mime = LOGO_MIME[req.file.mimetype];
        const logoPath = `data:${mime};base64,${req.file.buffer.toString('base64')}`;
        await prisma.school.upsert({
            where: { tenantId },
            update: { logoPath, updatedAt: new Date() },
            create: { tenantId, logoPath },
        });
        res.json({ success: true, data: { logoUrl: logoPath } });
    } catch (err) { console.error('Request failed:', err);
        res.status(500).json({ success: false, error: 'Something went wrong. Please try again.' });
    }
});

export default router;
