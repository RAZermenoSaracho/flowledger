import type { Request } from "express";
import { HttpError } from "./httpError.js";

type MultipartPart = {
  fieldName: string;
  filename?: string;
  contentType?: string;
  data: Buffer;
};

const headerSeparator = Buffer.from("\r\n\r\n");

export async function readMultipartParts(req: Request, maxBytes: number): Promise<MultipartPart[]> {
  const contentType = req.headers["content-type"] ?? "";
  const boundaryMatch = /(?:^|;)\s*boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType);
  const boundary = boundaryMatch?.[1] ?? boundaryMatch?.[2];

  if (!boundary) {
    throw new HttpError(400, "Multipart boundary is required");
  }

  const contentLength = Number(req.headers["content-length"] ?? 0);
  if (contentLength > maxBytes) {
    throw new HttpError(413, "Upload is too large");
  }

  const body = await readRequestBody(req, maxBytes);
  return parseMultipartBody(body, boundary);
}

function readRequestBody(req: Request, maxBytes: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalBytes = 0;

    req.on("data", (chunk: Buffer) => {
      totalBytes += chunk.length;

      if (totalBytes > maxBytes) {
        reject(new HttpError(413, "Upload is too large"));
        req.destroy();
        return;
      }

      chunks.push(chunk);
    });

    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function parseMultipartBody(body: Buffer, boundary: string): MultipartPart[] {
  const delimiter = Buffer.from(`--${boundary}`);
  const parts: MultipartPart[] = [];
  let cursor = body.indexOf(delimiter);

  while (cursor !== -1) {
    cursor += delimiter.length;

    if (body.subarray(cursor, cursor + 2).toString("ascii") === "--") {
      break;
    }

    if (body.subarray(cursor, cursor + 2).toString("ascii") !== "\r\n") {
      break;
    }
    cursor += 2;

    const headerEnd = body.indexOf(headerSeparator, cursor);
    if (headerEnd === -1) {
      throw new HttpError(400, "Invalid multipart payload");
    }

    const headers = parseHeaders(body.subarray(cursor, headerEnd).toString("utf8"));
    const contentStart = headerEnd + headerSeparator.length;
    const nextBoundary = body.indexOf(Buffer.from(`\r\n--${boundary}`), contentStart);

    if (nextBoundary === -1) {
      throw new HttpError(400, "Invalid multipart payload");
    }

    const disposition = headers.get("content-disposition") ?? "";
    const fieldName = dispositionParameter(disposition, "name");

    if (fieldName) {
      const filename = dispositionParameter(disposition, "filename");
      parts.push({
        fieldName,
        filename,
        contentType: headers.get("content-type") ?? undefined,
        data: body.subarray(contentStart, nextBoundary)
      });
    }

    cursor = nextBoundary + 2;
    cursor = body.indexOf(delimiter, cursor);
  }

  return parts;
}

function parseHeaders(rawHeaders: string) {
  const headers = new Map<string, string>();

  for (const line of rawHeaders.split("\r\n")) {
    const separator = line.indexOf(":");
    if (separator === -1) continue;

    headers.set(line.slice(0, separator).trim().toLowerCase(), line.slice(separator + 1).trim());
  }

  return headers;
}

function dispositionParameter(disposition: string, key: string) {
  const match = new RegExp(`${key}="([^"]*)"`).exec(disposition);
  return match?.[1];
}
