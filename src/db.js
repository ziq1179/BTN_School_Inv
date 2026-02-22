import { PrismaClient } from '@prisma/client';
import { PrismaLibSql } from '@prisma/adapter-libsql';

const tursoUrl = process.env.TURSO_DATABASE_URL;
const tursoToken = process.env.TURSO_AUTH_TOKEN;

let prisma;

if (tursoUrl && tursoToken) {
    // Turso (production / Netlify / serverless)
    const adapter = new PrismaLibSql({
        url: tursoUrl,
        authToken: tursoToken,
    });
    prisma = new PrismaClient({ adapter, log: ['warn', 'error'] });
} else {
    // Local SQLite (development)
    prisma = new PrismaClient({ log: ['warn', 'error'] });
}

export default prisma;
