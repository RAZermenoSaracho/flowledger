import type { Request, Response } from "express";
import {
  getProviderWebhookHealth,
  handleProviderWebhook
} from "../services/providerWebhooks.service.js";

export async function postWebhook(req: Request, res: Response) {
  const providerParam = req.params.provider;
  if (!providerParam) {
    res.status(400).json({ message: "Provider is required" });
    return;
  }

  const result = await handleProviderWebhook({
    providerParam,
    headers: req.headers,
    rawBody: req.rawBody,
    body: req.body
  });

  if (result.kind === "generic") {
    res.status(200).json({
      success: true,
      acceptedEvents: 1,
      result: result.result
    });
    return;
  }

  if (result.kind === "invalid_signature" || result.kind === "invalid_payload") {
    res.status(200).json({
      success: true,
      acceptedEvents: 0
    });
    return;
  }

  res.status(200).json({
    success: true,
    rid: result.rid,
    signatureVerification: result.signatureVerification,
    acceptedEvents: result.acceptedEvents
  });
}

export async function getWebhookHealth(req: Request, res: Response) {
  const providerParam = req.params.provider;
  if (!providerParam) {
    res.status(400).json({ message: "Provider is required" });
    return;
  }

  const result = getProviderWebhookHealth(providerParam);
  res.status(200).json(result);
}
