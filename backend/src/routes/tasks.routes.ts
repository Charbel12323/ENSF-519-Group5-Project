import { Router } from "express";
import { deleteTask, updateTask } from "../controllers/tasks.controller";
import { requireAuth } from "../middleware/auth";

const router = Router();

router.use(requireAuth);

router.patch("/:taskId", updateTask);
router.delete("/:taskId", deleteTask);

export default router;
