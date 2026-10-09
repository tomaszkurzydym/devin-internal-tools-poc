import { Router } from "express";
import type { DB } from "../../core/db.js";
import { notFound, oneOf, queryString } from "../../core/http.js";
import { actor, requirePermission } from "../../core/session.js";
import { getFlag, listFlags } from "./repository.js";
import { FLAG_STATUSES, OWNER_TEAMS } from "./types.js";
import { availableActions, changeFlag, type FlagAction } from "./workflow.js";

export function flagsRouter(db: DB): Router {
  const router = Router();
  const read = requirePermission("flags.read");
  const toggle = requirePermission("flags.toggle");

  const detail = (id: string) => {
    const flag = getFlag(db, id);
    if (!flag) throw notFound(`Feature flag ${id} not found`);
    return { flag, availableActions: availableActions(flag.status) };
  };

  router.get("/flags", read, (req, res) => {
    res.json({
      flags: listFlags(db, {
        q: queryString(req.query.q),
        status: oneOf(FLAG_STATUSES, req.query.status),
        team: oneOf(OWNER_TEAMS, req.query.team),
      }),
    });
  });

  router.get("/flags/:id", read, (req, res) => {
    res.json(detail(req.params.id as string));
  });

  for (const action of ["enable", "disable"] as const satisfies readonly FlagAction[]) {
    router.post(`/flags/:id/${action}`, toggle, (req, res) => {
      changeFlag(db, actor(req).id, req.params.id as string, action, req.body?.reason);
      res.json(detail(req.params.id as string));
    });
  }

  return router;
}
