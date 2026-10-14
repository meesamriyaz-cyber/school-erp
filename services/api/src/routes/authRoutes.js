
import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import requireTrustedOrigin from "../middleware/requireTrustedOrigin.js";
import {
  login,
  refresh,
  logout,
  changePassword,
} from "../controllers/authController.js";
import authenticate from "../middleware/authenticate.js";
const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many login attempts. Please try again later.",
  },
});

const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many refresh requests. Please try again later.",
  },
});

const passwordChangeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10 ,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many password-change attempts. Please try again later.",
  },
});


router.post(
  "/login",
  loginLimiter,
  requireTrustedOrigin,
  login
);

router.post(
  "/refresh",
  refreshLimiter,
  requireTrustedOrigin,
  refresh
);

router.post(
  "/logout",
  refreshLimiter,
  requireTrustedOrigin,
  logout
);

router.post(
  "/change-password",
  passwordChangeLimiter,
  requireTrustedOrigin,
  authenticate,
  changePassword
);

export default router;
