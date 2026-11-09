// Persistent local Postgres for development (embedded-postgres).
// Usage: node scripts/dev-db.mjs   (keeps running; Ctrl+C to stop)
import EmbeddedPostgres from 'embedded-postgres';

const PORT = 54329;
const pg = new EmbeddedPostgres({
  databaseDir: './.pgdata',
  user: 'postgres',
  password: 'postgres',
  port: PORT,
  persistent: true,
});

try {
  await pg.initialise();
} catch {
  // already initialised
}
await pg.start();
console.log(`dev database ready on port ${PORT}`);
// keep the process alive
setInterval(() => {}, 1 << 30);
process.on('SIGINT', async () => { await pg.stop(); process.exit(0); });
