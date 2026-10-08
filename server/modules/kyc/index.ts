import type { ServerModule } from "../../core/module.js";
import { kycRouter } from "./routes.js";
import { KYC_SCHEMA, KYC_TABLES } from "./schema.js";
import { seedKyc } from "./seed.js";
import { KYC_AUDIT_ACTIONS } from "./types.js";

export const kycModule: ServerModule = {
  name: "kyc",
  apiPath: "/api/kyc",
  schema: KYC_SCHEMA,
  tables: KYC_TABLES,
  auditActions: Object.values(KYC_AUDIT_ACTIONS),
  router: kycRouter,
  seed: seedKyc,
};
