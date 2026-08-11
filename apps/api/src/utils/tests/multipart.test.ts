import { EventEmitter } from "node:events";
import type { Request } from "express";
import { describe, expect, it } from "vitest";
import { HttpError } from "../httpError.js";
import { readMultipartParts } from "../multipart.js";

function mockRequest(headers: Record<string, string>) {
  const emitter = new EventEmitter();
  return Object.assign(emitter, { headers, destroy: () => {} }) as unknown as Request;
}

function buildMultipartBody(boundary: string, parts: string[]) {
  const body = parts.map((part) => `--${boundary}\r\n${part}`).join("");
  return Buffer.from(`${body}--${boundary}--\r\n`);
}

describe("readMultipartParts", () => {
  it("rejects when the content-type header has no boundary", async () => {
    const req = mockRequest({ "content-type": "multipart/form-data" });

    await expect(readMultipartParts(req, 1000)).rejects.toMatchObject({
      statusCode: 400,
      message: "Multipart boundary is required"
    });
  });

  it("rejects when content-length exceeds maxBytes", async () => {
    const req = mockRequest({
      "content-type": "multipart/form-data; boundary=X",
      "content-length": "5000"
    });

    await expect(readMultipartParts(req, 1000)).rejects.toMatchObject({
      statusCode: 413,
      message: "Upload is too large"
    });
  });

  it("parses a single text field", async () => {
    const boundary = "boundary123";
    const body = buildMultipartBody(boundary, [
      'Content-Disposition: form-data; name="title"\r\n\r\ntest value\r\n'
    ]);
    const req = mockRequest({
      "content-type": `multipart/form-data; boundary=${boundary}`
    });

    const promise = readMultipartParts(req, 10_000);
    req.emit("data", body);
    req.emit("end");
    const parts = await promise;

    expect(parts).toEqual([
      {
        fieldName: "title",
        filename: undefined,
        contentType: undefined,
        data: Buffer.from("test value")
      }
    ]);
  });

  it("parses a file field with a filename and content type", async () => {
    const boundary = "boundary123";
    const body = buildMultipartBody(boundary, [
      'Content-Disposition: form-data; name="avatar"; filename="a.png"\r\nContent-Type: image/png\r\n\r\nbinarydata\r\n'
    ]);
    const req = mockRequest({
      "content-type": `multipart/form-data; boundary=${boundary}`
    });

    const promise = readMultipartParts(req, 10_000);
    req.emit("data", body);
    req.emit("end");
    const [part] = await promise;

    expect(part).toMatchObject({
      fieldName: "avatar",
      filename: "a.png",
      contentType: "image/png"
    });
    expect(part?.data.toString()).toBe("binarydata");
  });

  it("parses multiple parts in one body", async () => {
    const boundary = "boundary123";
    const body = buildMultipartBody(boundary, [
      'Content-Disposition: form-data; name="a"\r\n\r\none\r\n',
      'Content-Disposition: form-data; name="b"\r\n\r\ntwo\r\n'
    ]);
    const req = mockRequest({
      "content-type": `multipart/form-data; boundary=${boundary}`
    });

    const promise = readMultipartParts(req, 10_000);
    req.emit("data", body);
    req.emit("end");
    const parts = await promise;

    expect(parts.map((part) => part.fieldName)).toEqual(["a", "b"]);
    expect(parts.map((part) => part.data.toString())).toEqual(["one", "two"]);
  });

  it("rejects when the streamed body exceeds maxBytes", async () => {
    const req = mockRequest({
      "content-type": "multipart/form-data; boundary=X"
    });

    const promise = readMultipartParts(req, 5);
    req.emit("data", Buffer.from("way more than five bytes"));

    await expect(promise).rejects.toMatchObject({
      statusCode: 413,
      message: "Upload is too large"
    });
  });

  it("rejects a malformed body missing the header/body separator", async () => {
    const boundary = "boundary123";
    const body = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="a"\r\n--${boundary}--\r\n`
    );
    const req = mockRequest({
      "content-type": `multipart/form-data; boundary=${boundary}`
    });

    const promise = readMultipartParts(req, 10_000);
    req.emit("data", body);
    req.emit("end");

    await expect(promise).rejects.toBeInstanceOf(HttpError);
  });
});
