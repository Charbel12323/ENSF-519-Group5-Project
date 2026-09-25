import { Router } from "express";
import { listMyInvites, respondToInvite } from "../controllers/groups.controller";
import { requireAuth } from "../middleware/auth";

const router = Router();

router.use(requireAuth);

router.get("/", listMyInvites);
router.post("/:inviteId/respond", respondToInvite);

export default router;
