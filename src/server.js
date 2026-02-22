import prisma from './db.js';
import app from './app.js';

const PORT = process.env.PORT || 3000;

// ── Start ────────────────────────────────────────────────────────────────────
async function start() {
    try {
        await prisma.$connect();
        console.log('✅ Database connected');

        app.listen(PORT, () => {
            console.log(`
╔══════════════════════════════════════════════════╗
║      🏫 School Inventory System API               ║
║      Running on http://localhost:${PORT}            ║
╚══════════════════════════════════════════════════╝
Available endpoints:
  GET  /api/health
  GET  /api/categories
  POST /api/categories
  GET  /api/items
  GET  /api/items/sku/:sku
  POST /api/items
  POST /api/items/:id/stock-in
  POST /api/items/:id/sale
  GET  /api/transactions
  GET  /api/transactions/summary
      `);
        });
    } catch (err) {
        console.error('❌ Failed to start server:', err);
        process.exit(1);
    }
}

// Graceful shutdown
process.on('SIGINT', async () => {
    await prisma.$disconnect();
    console.log('\n👋 Server shut down gracefully');
    process.exit(0);
});

start();
