import {
  loginSchema,
  registerSchema,
  updateUserEmailSchema,
  updateUserPasswordSchema
} from "@flowledger/shared";
import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { requireWebOrigin } from "../../middleware/requireWebOrigin.js";
import { validate } from "../../middleware/validate.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { googleRouter } from "./providers/google/google.routes.js";
import { register } from "./controllers/create.controller.js";
import { getMe, login } from "./controllers/read.controller.js";
import { refresh } from "./controllers/update.controller.js";
import { logout } from "./controllers/delete.controller.js";
import { patchEmail, patchPassword } from "../users/controllers/update.controller.js";
import {
  credentialChangeLimiter,
  loginAddressLimiter,
  loginFailureLimiter,
  refreshLimiter,
  registerLimiter
} from "./utils/authRateLimits.js";

/** Express router for `/auth` — register, login, refresh, logout, `me`, password and email change (here so the `Path=/auth` refresh cookie identifies the current device), and mounts the Google OAuth sub-router. */
export const authRouter = Router();

authRouter.post(
  "/register",
  requireWebOrigin,
  registerLimiter,
  validate(registerSchema),
  asyncHandler(register)
);
authRouter.post(
  "/login",
  requireWebOrigin,
  loginAddressLimiter,
  loginFailureLimiter,
  validate(loginSchema),
  asyncHandler(login)
);
authRouter.post("/refresh", requireWebOrigin, refreshLimiter, asyncHandler(refresh));
authRouter.post("/logout", requireWebOrigin, asyncHandler(logout));
authRouter.use("/google", googleRouter);
authRouter.get("/me", requireAuth, asyncHandler(getMe));
authRouter.patch(
  "/password",
  requireWebOrigin,
  requireAuth,
  credentialChangeLimiter,
  validate(updateUserPasswordSchema),
  asyncHandler(patchPassword)
);
authRouter.patch(
  "/email",
  requireWebOrigin,
  requireAuth,
  credentialChangeLimiter,
  validate(updateUserEmailSchema),
  asyncHandler(patchEmail)
);
