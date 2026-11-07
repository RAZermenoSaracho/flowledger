import type { IncomingMessage, ServerResponse } from "node:http";
import type { TokenIndexer } from "morgan";

function referrerHost(referrer: string | undefined) {
  if (!referrer) return "-";
  try {
    return new URL(referrer).host;
  } catch {
    return "-";
  }
}

/**
 * Morgan format that logs paths and referrer hosts only, because query strings carry OAuth codes,
 * signed state, and consent requests, which must not reach logs.
 */
export function requestLogFormat(
  tokens: TokenIndexer,
  req: IncomingMessage & { originalUrl?: string },
  res: ServerResponse
) {
  const url = req.originalUrl ?? req.url ?? "";

  return [
    tokens["remote-addr"]?.(req, res),
    tokens.method?.(req, res),
    url.split("?")[0],
    tokens.status?.(req, res),
    tokens.res?.(req, res, "content-length") ?? "-",
    `${tokens["response-time"]?.(req, res)}ms`,
    `ref=${referrerHost(req.headers.referer)}`,
    `"${tokens["user-agent"]?.(req, res) ?? "-"}"`
  ].join(" ");
}
