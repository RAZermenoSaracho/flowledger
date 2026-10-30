import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import { Router } from "express";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { createRateLimiter } from "../../utils/rateLimit.js";
import { methodNotAllowed, postMcp } from "./controllers/mcp.controller.js";
import { originGuard } from "./utils/originGuard.js";
import { mcpResourceMetadataUrl } from "../oauth/utils/tokens.js";
import { credentialTokenVerifier } from "./utils/tokenVerifier.js";

/** Router for `/mcp`: rate limit, Origin guard, bearer-credential auth, then the stateless POST handler; other methods get 405. */
export const mcpRouter = Router();

mcpRouter.use(
  createRateLimiter({ windowMs: 60_000, limit: 120 }),
  originGuard,
  requireBearerAuth({
    verifier: credentialTokenVerifier,
    resourceMetadataUrl: mcpResourceMetadataUrl()
  })
);
mcpRouter.post("/", asyncHandler(postMcp));
mcpRouter.all("/", methodNotAllowed);
