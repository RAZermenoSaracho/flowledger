import { Router } from "express";
import { asyncHandler } from "../../../../utils/asyncHandler.js";
import {
  getDeprecatedWebhook,
  getSyncfyHealth,
  postDeprecatedWebhook
} from "./controllers/health.controller.js";

const router = Router();

router.get("/health", asyncHandler(getSyncfyHealth));
router.post("/webhook", asyncHandler(postDeprecatedWebhook));
router.get("/webhook", asyncHandler(getDeprecatedWebhook));

export default router;
