import { Router } from "express";

const router = Router();

router.get("/health", async (_req, res) => {
  res.json({
    success: true,
    service: "syncfy",
    timestamp: new Date().toISOString()
  });
});

router.post("/webhook", (_req, res) => {
  console.warn("[SYNCFY WEBHOOK] Deprecated webhook route rejected", {
    replacementRoute: "/providers/webhooks/syncfy"
  });

  res.status(410).json({
    success: false,
    deprecated: true,
    message:
      "The Syncfy webhook route has moved to /providers/webhooks/syncfy."
  });
});

router.get("/webhook", (_req, res) => {
  res.status(410).json({
    success: false,
    deprecated: true,
    message:
      "The Syncfy webhook route has moved to /providers/webhooks/syncfy."
  });
});

export default router;
