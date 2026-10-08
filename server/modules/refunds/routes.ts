import { Router } from "express";
import type { DB } from "../../core/db.js";
import { notFound, oneOf, queryString } from "../../core/http.js";
import { actor, requirePermission } from "../../core/session.js";
import { getRefund, listRefunds } from "./repository.js";
import { REFUND_STATUSES } from "./types.js";
import { availableActions, markReviewed } from "./workflow.js";

export function refundsRouter(db: DB): Router {
  const router = Router();
  const read = requirePermission("refunds.read");
  const review = requirePermission("refunds.review");

  const detail = (id: string) => {
    const refund = getRefund(db, id);
    if (!refund) throw notFound(`Refund request ${id} not found`);
    return { refund, availableActions: availableActions(refund.status) };
  };

  router.get("/requests", read, (req, res) => {
    res.json({
      refunds: listRefunds(db, { q: queryString(req.query.q), status: oneOf(REFUND_STATUSES, req.query.status) }),
    });
  });

  router.get("/requests/:id", read, (req, res) => {
    res.json(detail(req.params.id as string));
  });

  router.post("/requests/:id/mark-reviewed", review, (req, res) => {
    markReviewed(db, actor(req).id, req.params.id as string);
    res.json(detail(req.params.id as string));
  });

  return router;
}
