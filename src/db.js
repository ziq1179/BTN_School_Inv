import { PrismaClient } from '@prisma/client';

// If DATABASE_URL contains REPLACE_ME and DB_PASSWORD is set, build URL with encoded password (fixes special chars)
let url = process.env.DATABASE_URL;
const rawPassword = process.env.DB_PASSWORD;
if (url && rawPassword && url.includes('REPLACE_ME')) {
    process.env.DATABASE_URL = url.replace('REPLACE_ME', encodeURIComponent(rawPassword));
}

const prisma = new PrismaClient({ log: ['warn', 'error'] });

export default prisma;
