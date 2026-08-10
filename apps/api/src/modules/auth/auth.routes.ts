import { loginSchema, registerSchema } from "@flowledger/shared";
import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { googleRouter } from "./providers/google/google.routes.js";
import { register } from "./controllers/create.controller.js";
import { getMe, login } from "./controllers/read.controller.js";
import { refresh } from "./controllers/update.controller.js";
import { logout } from "./controllers/delete.controller.js";

/** Express router for `/auth` — register, login, refresh, logout, `me`, and mounts the Google OAuth sub-router. */
export const authRouter = Router();

authRouter.post("/register", validate(registerSchema), asyncHandler(register));
authRouter.post("/login", validate(loginSchema), asyncHandler(login));
authRouter.post("/refresh", asyncHandler(refresh));
authRouter.post("/logout", asyncHandler(logout));
authRouter.use("/google", googleRouter);
authRouter.get("/me", requireAuth, asyncHandler(getMe));
