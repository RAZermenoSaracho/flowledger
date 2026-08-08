import type { Request, Response } from "express";

/** Health-check endpoint for the Syncfy integration. */
export async function getSyncfyHealth(_req: Request, res: Response) {
  res.json({
    success: true,
    service: "syncfy",
    timestamp: new Date().toISOString()
  });
}

/** Rejects the deprecated Syncfy webhook POST route with 410; live traffic must use `/providers/webhooks/syncfy`. */
export async function postDeprecatedWebhook(_req: Request, res: Response) {
  console.warn("[SYNCFY WEBHOOK] Deprecated webhook route rejected", {
    replacementRoute: "/providers/webhooks/syncfy"
  });

  res.status(410).json({
    success: false,
    deprecated: true,
    message: "The Syncfy webhook route has moved to /providers/webhooks/syncfy."
  });
}

/** Rejects the deprecated Syncfy webhook GET route with 410; live traffic must use `/providers/webhooks/syncfy`. */
export async function getDeprecatedWebhook(_req: Request, res: Response) {
  res.status(410).json({
    success: false,
    deprecated: true,
    message: "The Syncfy webhook route has moved to /providers/webhooks/syncfy."
  });
}
