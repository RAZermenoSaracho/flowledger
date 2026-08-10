import { Router } from "express";
import { asyncHandler } from "../../../../utils/asyncHandler.js";
import {
  getDeprecatedWebhook,
  getSyncfyHealth,
  postDeprecatedWebhook
} from "./controllers/health.controller.js";

/** Express router for legacy/direct Syncfy endpoints: health check plus the deprecated webhook stub routes. */
const router = Router();

router.get("/health", asyncHandler(getSyncfyHealth));
router.post("/webhook", asyncHandler(postDeprecatedWebhook));
router.get("/webhook", asyncHandler(getDeprecatedWebhook));

export default router;
