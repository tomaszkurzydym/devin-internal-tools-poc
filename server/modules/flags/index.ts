import type { ServerModule } from "../../core/module.js";
import { flagsRouter } from "./routes.js";
import { FLAGS_SCHEMA, FLAGS_TABLES } from "./schema.js";
import { seedFlags } from "./seed.js";
import { FLAG_AUDIT_ACTIONS } from "./types.js";

export const flagsModule: ServerModule = {
  name: "flags",
  apiPath: "/api/feature-flags",
  schema: FLAGS_SCHEMA,
  tables: FLAGS_TABLES,
  auditActions: Object.values(FLAG_AUDIT_ACTIONS),
  router: flagsRouter,
  seed: seedFlags,
};
