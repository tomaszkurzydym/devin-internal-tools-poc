import type { Router } from "express";
import type { DB, ModuleSchema } from "./db.js";

/**
 * What a domain module hands to the platform. Registered once in server/modules/index.ts;
 * everything else (session, permissions, audit, transactions) is consumed from server/core.
 */
export interface ServerModule extends ModuleSchema {
  name: string;
  /** Mounted under this path, e.g. "/api/refunds". */
  apiPath: string;
  /** Known audit action names, so the Audit Log can filter on them before any event exists. */
  auditActions: readonly string[];
  router: (db: DB) => Router;
  /** Synthetic data only. Called inside the seed transaction after demo users exist. */
  seed: (db: DB, iso: (offsetMinutes: number) => string) => void;
}
