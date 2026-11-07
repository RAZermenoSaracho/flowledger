import type { Server } from "node:http";
import { Test } from "supertest";
import { loopbackOrigin } from "./loopback.js";

type PatchableTest = { serverAddress(app: Server, path: string): string; _server?: Server };

/** Makes every supertest request connect through `loopbackOrigin` instead of its hardcoded `127.0.0.1`. */
(Test.prototype as unknown as PatchableTest).serverAddress = function (this: PatchableTest, app, path) {
  if (!app.address()) this._server = app.listen(0);
  return loopbackOrigin(app) + path;
};
