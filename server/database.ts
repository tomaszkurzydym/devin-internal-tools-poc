import { DEFAULT_DB_PATH, dropAll, migrate, openDatabase, type DB } from "./core/db.js";
import { MODULES } from "./modules/index.js";

/** Opens the app database with every registered module's schema applied. */
export const openAppDatabase = (file: string = DEFAULT_DB_PATH): DB => openDatabase(file, MODULES);
export const resetAppDatabase = (db: DB): void => {
  dropAll(db, MODULES);
  migrate(db, MODULES);
};
