import { Router } from "express";
import { login, me, signup } from "../controllers/auth.controller";
import { requireAuth } from "../middleware/auth";
import { forgotPassword, resetPassword, resendVerification, verifyEmail, updateProfile, exchangeLogin } from "../controllers/auth.controller";
import { providers, startGoogle, googleCallback } from "../controllers/google.controller";
import { rateLimit } from "express-rate-limit";

const router = Router();
const limiter = rateLimit({ windowMs: 15 * 60000, limit: 30, standardHeaders: "draft-8", legacyHeaders: false,
  message: { error: "Too many attempts. Please try again in 15 minutes" } });
router.get("/me", requireAuth, me);
router.get("/providers", providers);
router.use(limiter);

router.post("/signup", signup);
router.post("/login", login);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);
router.post("/verify-email", verifyEmail);
router.post("/resend-verification", requireAuth, resendVerification);
router.patch("/profile", requireAuth, updateProfile);
router.get("/google", startGoogle);
router.post("/google/link", requireAuth, startGoogle);
router.get("/google/callback", googleCallback);
router.post("/exchange", exchangeLogin);

export default router;
