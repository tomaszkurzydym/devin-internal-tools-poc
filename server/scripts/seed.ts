/**
 * Local demo seed/reset. `npm run seed` seeds an empty database (no-op otherwise);
 * `npm run db:reset` drops all tables (including sessions and audit events) and reseeds.
 */
import { DEFAULT_DB_PATH } from "../core/db.js";
import { openAppDatabase, resetAppDatabase } from "../database.js";
import { seed, seedIfEmpty } from "./seedData.js";

const reset = process.argv.includes("--reset");
const db = openAppDatabase(DEFAULT_DB_PATH);
if (reset) {
  resetAppDatabase(db);
  seed(db);
  console.log(`Reset and reseeded ${DEFAULT_DB_PATH}`);
} else if (seedIfEmpty(db)) {
  console.log(`Seeded ${DEFAULT_DB_PATH}`);
} else {
  console.log(`${DEFAULT_DB_PATH} already contains data; use "npm run db:reset" to wipe and reseed.`);
}
db.close();
