import { Router } from "express";
import { deleteTask, updateTask } from "../controllers/tasks.controller";
import { requireAuth } from "../middleware/auth";
import multer from "multer";
import { getTask, myTasks, saveSubtask, deleteSubtask, saveComment, deleteComment, uploadAttachment, downloadAttachment, deleteAttachment } from "../controllers/tasks.controller";

const router = Router();

router.use(requireAuth);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 0, parts: 1 } });

router.get("/mine", myTasks);
router.get("/:taskId", getTask);
router.post("/:taskId/subtasks", saveSubtask);
router.patch("/:taskId/subtasks/:itemId", saveSubtask);
router.delete("/:taskId/subtasks/:itemId", deleteSubtask);
router.post("/:taskId/comments", saveComment);
router.patch("/:taskId/comments/:itemId", saveComment);
router.delete("/:taskId/comments/:itemId", deleteComment);
router.post("/:taskId/attachments", upload.single("file"), uploadAttachment);
router.get("/:taskId/attachments/:itemId", downloadAttachment);
router.delete("/:taskId/attachments/:itemId", deleteAttachment);

router.patch("/:taskId", updateTask);
router.delete("/:taskId", deleteTask);

export default router;
