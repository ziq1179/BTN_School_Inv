import { PrismaClient } from '@prisma/client';
// Web adapter: HTTP-only, no native modules - works on Netlify & locally with Turso
import { PrismaLibSql } from '@prisma/adapter-libsql/web';

const tursoUrl = process.env.TURSO_DATABASE_URL;
const tursoToken = process.env.TURSO_AUTH_TOKEN;

let prisma;

if (tursoUrl && tursoToken) {
    // Turso: web adapter works everywhere (Node, Netlify, serverless)
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
