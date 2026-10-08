import type { ServerModule } from "../../core/module.js";
import { refundsRouter } from "./routes.js";
import { REFUNDS_SCHEMA, REFUNDS_TABLES } from "./schema.js";
import { seedRefunds } from "./seed.js";
import { REFUND_AUDIT_ACTIONS } from "./types.js";

export const refundsModule: ServerModule = {
  name: "refunds",
  apiPath: "/api/refunds",
  schema: REFUNDS_SCHEMA,
  tables: REFUNDS_TABLES,
  auditActions: Object.values(REFUND_AUDIT_ACTIONS),
  router: refundsRouter,
  seed: seedRefunds,
};
