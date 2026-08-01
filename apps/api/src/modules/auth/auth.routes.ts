import { loginSchema, registerSchema } from "@flowledger/shared";
import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { googleRouter } from "./providers/google/google.routes.js";
import { register } from "./controllers/create.controller.js";
import { getMe, login } from "./controllers/read.controller.js";

export const authRouter = Router();

authRouter.post("/register", validate(registerSchema), asyncHandler(register));
authRouter.post("/login", validate(loginSchema), asyncHandler(login));
authRouter.use("/google", googleRouter);
authRouter.get("/me", requireAuth, asyncHandler(getMe));
