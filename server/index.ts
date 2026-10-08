import path from "node:path";
import { createApp } from "./app.js";
import { DEFAULT_DB_PATH } from "./core/db.js";
import { openAppDatabase } from "./database.js";
import { seedIfEmpty } from "./scripts/seedData.js";

const port = Number(process.env.PORT ?? 3000);
const db = openAppDatabase(DEFAULT_DB_PATH);
if (seedIfEmpty(db)) console.log("Database was empty: seeded synthetic demo data.");

const app = createApp(db, {
  staticDir: path.resolve("dist/web"),
  secureCookies: process.env.SECURE_COOKIES === "true",
});
app.listen(port, () => {
  console.log(`Internal tools POC listening on http://localhost:${port} (db: ${DEFAULT_DB_PATH})`);
});
