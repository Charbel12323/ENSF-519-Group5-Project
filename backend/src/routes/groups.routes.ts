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
import { renameGroup, deleteGroup, removeMember, transferOwnership, createColumn, renameColumn, reorderColumns, deleteColumn, saveLabel, deleteLabel, listActivity } from "../controllers/groups.controller";

const router = Router();

router.use(requireAuth);

router.post("/", createGroup);
router.get("/", listGroups);
router.get("/:groupId", getGroup);
router.patch("/:groupId", renameGroup);
router.delete("/:groupId", deleteGroup);
router.post("/:groupId/leave", removeMember);
router.delete("/:groupId/members/:userId", removeMember);
router.post("/:groupId/ownership", transferOwnership);
router.post("/:groupId/columns", createColumn);
router.put("/:groupId/columns/order", reorderColumns);
router.patch("/:groupId/columns/:columnId", renameColumn);
router.delete("/:groupId/columns/:columnId", deleteColumn);
router.post("/:groupId/labels", saveLabel);
router.patch("/:groupId/labels/:labelId", saveLabel);
router.delete("/:groupId/labels/:labelId", deleteLabel);
router.get("/:groupId/activity", listActivity);
router.post("/:groupId/invite", inviteMember);
router.get("/:groupId/dashboard", getGroupDashboard);
router.get("/:groupId/tasks", listTasks);
router.post("/:groupId/tasks", createTask);

export default router;
