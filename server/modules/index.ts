import type { ServerModule } from "../core/module.js";
import { flagsModule } from "./flags/index.js";
import { kycModule } from "./kyc/index.js";
import { refundsModule } from "./refunds/index.js";

/** The only list of domain modules. Adding an application = one entry here. */
export const MODULES: readonly ServerModule[] = [kycModule, refundsModule, flagsModule];
