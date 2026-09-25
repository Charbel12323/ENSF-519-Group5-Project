import { Router } from "express";
import {
  createGroup,
  getGroup,
  inviteMember,
  listGroups,
} from "../controllers/groups.controller";
import { createTask, listTasks } from "../controllers/tasks.controller";
import { getGroupDashboard } from "../controllers/dashboard.controller";
import { requireAuth } from "../middleware/auth";

const router = Router();

router.use(requireAuth);

router.post("/", createGroup);
router.get("/", listGroups);
router.get("/:groupId", getGroup);
router.post("/:groupId/invite", inviteMember);
router.get("/:groupId/dashboard", getGroupDashboard);
router.get("/:groupId/tasks", listTasks);
router.post("/:groupId/tasks", createTask);

export default router;
