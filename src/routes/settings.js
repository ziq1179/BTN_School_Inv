import express from 'express';
import multer from 'multer';
import { writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import prisma from '../db.js';
import { requireAuth, requireRole, ROLES } from '../middleware/auth.js';

const router = express.Router();
const __dirname = dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = join(__dirname, '../../public/uploads');
const LOGO_FILENAME = 'logo.png';

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
    fileFilter: (req, file, cb) => {
        const allowed = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'];
        if (allowed.includes(file.mimetype)) cb(null, true);
        else cb(new Error('Only images (PNG, JPEG, GIF, WebP) are allowed'));
    },
});

// GET /api/settings — public (for login page and app shell)
router.get('/', async (req, res) => {
    try {
        const row = await prisma.school.findFirst({ where: { id: 1 } });
        const name = row?.name ?? 'By The Numb3rs';
        const logoUrl = row?.logoPath ?? '/logo.png';
        res.json({ success: true, data: { schoolName: name, logoUrl } });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// PUT /api/settings — update school name (admin only)
router.put('/', requireAuth, requireRole(ROLES.ADMIN), async (req, res) => {
    try {
        const { schoolName } = req.body;
        if (!schoolName || typeof schoolName !== 'string') {
            return res.status(400).json({ success: false, error: 'schoolName is required' });
        }
        await prisma.school.upsert({
            where: { id: 1 },
            update: { name: schoolName.trim(), updatedAt: new Date() },
            create: { id: 1, name: schoolName.trim() },
        });
        const row = await prisma.school.findUnique({ where: { id: 1 } });
        res.json({
            success: true,
            data: { schoolName: row.name, logoUrl: row.logoPath ?? '/logo.png' },
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// POST /api/settings/logo — upload logo (admin only)
router.post('/logo', requireAuth, requireRole(ROLES.ADMIN), upload.single('logo'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'No file uploaded' });
        }
        await mkdir(UPLOADS_DIR, { recursive: true });
        const filePath = join(UPLOADS_DIR, LOGO_FILENAME);
        await writeFile(filePath, req.file.buffer);
        const logoPath = '/uploads/' + LOGO_FILENAME;
        await prisma.school.upsert({
            where: { id: 1 },
            update: { logoPath, updatedAt: new Date() },
            create: { id: 1, logoPath },
        });
        res.json({ success: true, data: { logoUrl: logoPath } });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

export default router;
