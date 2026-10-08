import { Router } from "express";
import type { DB } from "../../core/db.js";
import { notFound } from "../../core/http.js";
import { actor, requirePermission } from "../../core/session.js";
import { getApplication, listApplications, listNotes } from "./repository.js";
import { KYC_STATUSES, RISK_LEVELS, type KycStatus, type RiskLevel } from "./types.js";
import { addNote, approve, availableActions, reject, startReview } from "./workflow.js";

function oneOf<T extends string>(values: readonly T[], v: unknown): T | undefined {
  return typeof v === "string" && (values as readonly string[]).includes(v) ? (v as T) : undefined;
}

export function kycRouter(db: DB): Router {
  const router = Router();
  const read = requirePermission("kyc:read");
  const review = requirePermission("kyc:review");

  const detail = (id: string) => {
    const application = getApplication(db, id);
    if (!application) throw notFound(`Application ${id} not found`);
    return { application, notes: listNotes(db, id), availableActions: availableActions(application.status) };
  };

  router.get("/applications", read, (req, res) => {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    res.json({
      applications: listApplications(db, {
        q: q || undefined,
        status: oneOf<KycStatus>(KYC_STATUSES, req.query.status),
        risk: oneOf<RiskLevel>(RISK_LEVELS, req.query.risk),
      }),
    });
  });

  // Read-only: viewing a detail page never changes status.
  router.get("/applications/:id", read, (req, res) => {
    res.json(detail(req.params.id as string));
  });

  router.post("/applications/:id/start-review", review, (req, res) => {
    startReview(db, actor(req).id, req.params.id as string);
    res.json(detail(req.params.id as string));
  });

  router.post("/applications/:id/notes", review, (req, res) => {
    const { noteId } = addNote(db, actor(req).id, req.params.id as string, req.body?.body);
    res.status(201).json({ noteId, ...detail(req.params.id as string) });
  });

  router.post("/applications/:id/approve", review, (req, res) => {
    approve(db, actor(req).id, req.params.id as string);
    res.json(detail(req.params.id as string));
  });

  router.post("/applications/:id/reject", review, (req, res) => {
    reject(db, actor(req).id, req.params.id as string, req.body?.reason);
    res.json(detail(req.params.id as string));
  });

  return router;
}
