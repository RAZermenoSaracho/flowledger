import type { ProviderConnectionFlow } from "@flowledger/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { FakeSyncfyWidget, instances } = vi.hoisted(() => {
  class FakeSyncfyWidget {
    handlers: Record<string, (...args: unknown[]) => void> = {};
    params: unknown;
    openCalls = 0;
    setEntrypointCredentialCalls: string[] = [];
    setEntrypointUpdateCredentialCalls: string[] = [];

    constructor(params: unknown) {
      this.params = params;
      instances.push(this);
    }

    open() {
      this.openCalls += 1;
    }

    setEntrypointCredential(idCredential: string) {
      this.setEntrypointCredentialCalls.push(idCredential);
    }

    setEntrypointUpdateCredential(idCredential: string) {
      this.setEntrypointUpdateCredentialCalls.push(idCredential);
    }

    on(event: string, callback: (...args: unknown[]) => void) {
      this.handlers[event] = callback;
    }
  }

  const instances: FakeSyncfyWidget[] = [];
  return { FakeSyncfyWidget, instances };
});

vi.mock("@syncfy/authentication-widget/umd", () => ({ default: FakeSyncfyWidget }));

const { openSyncfyWidget } = await import("../syncfyWidget");

const widget: NonNullable<ProviderConnectionFlow["widget"]> = {
  token: "widget-token",
  config: { theme: "light" }
};

/** Calls openSyncfyWidget and waits for its (guaranteed-fresh) widget instance to be constructed. */
async function open(...args: Parameters<typeof openSyncfyWidget>) {
  const baseline = instances.length;
  const promise = openSyncfyWidget(...args);
  await vi.waitFor(() => {
    if (instances.length <= baseline) throw new Error("widget not constructed yet");
  });
  return { promise, fake: instances[instances.length - 1]! };
}

beforeEach(() => {
  instances.length = 0;
});

afterEach(() => {
  document.getElementById("widget")?.remove();
});

describe("openSyncfyWidget", () => {
  it("opens the widget by default (no entrypoint) and resolves on 'success'", async () => {
    const onSettled = vi.fn();
    const { promise, fake } = await open(widget, { onSettled });

    expect(fake.openCalls).toBe(1);
    fake.handlers.success?.({ id_credential: "cred-1" });

    const result = await promise;
    expect(result).toEqual({ event: "success", credential: { id_credential: "cred-1" } });
    expect(onSettled).toHaveBeenCalledOnce();
  });

  it("resolves on 'updated'", async () => {
    const { promise, fake } = await open(widget);

    fake.handlers.updated?.({ id_credential: "cred-1" });

    await expect(promise).resolves.toEqual({
      event: "updated",
      credential: { id_credential: "cred-1" }
    });
  });

  it("resolves on 'closed'", async () => {
    const { promise, fake } = await open(widget);

    fake.handlers.closed?.(undefined);

    await expect(promise).resolves.toEqual({ event: "closed", credential: undefined });
  });

  it("calls onError and resolves with the error event on 'error'", async () => {
    const onError = vi.fn();
    const { promise, fake } = await open(widget, { onError });

    fake.handlers.error?.({ id_credential: "cred-1" });

    const result = await promise;
    expect(result.event).toBe("error");
    expect(onError).toHaveBeenCalledWith(
      "Syncfy reported an error while processing the credential."
    );
  });

  it("calls onError and resolves on 'socket-error'", async () => {
    const onError = vi.fn();
    const { promise, fake } = await open(widget, { onError });

    fake.handlers["socket-error"]?.({ message: "disconnected" });

    const result = await promise;
    expect(result.event).toBe("socket-error");
    expect(onError).toHaveBeenCalledWith(
      "Syncfy connection failed while processing the credential."
    );
  });

  it("calls onError and resolves on 'api-error'", async () => {
    const onError = vi.fn();
    const { promise, fake } = await open(widget, { onError });

    fake.handlers["api-error"]?.(500, { message: "server error" });

    const result = await promise;
    expect(result.event).toBe("api-error");
    expect(onError).toHaveBeenCalledOnce();
  });

  it("settles only once even if multiple events fire", async () => {
    const onSettled = vi.fn();
    const { promise, fake } = await open(widget, { onSettled });

    fake.handlers.success?.({ id_credential: "cred-1" });
    fake.handlers.closed?.(undefined);

    await promise;
    expect(onSettled).toHaveBeenCalledOnce();
  });

  it("calls setEntrypointCredential instead of open() for a 'credential' entrypoint", async () => {
    const { promise, fake } = await open(widget, {
      entrypoint: { type: "credential", idCredential: "cred-1" }
    });

    expect(fake.openCalls).toBe(0);
    expect(fake.setEntrypointCredentialCalls).toEqual(["cred-1"]);

    fake.handlers.closed?.(undefined);
    await promise;
  });

  it("calls setEntrypointUpdateCredential instead of open() for an 'updateCredential' entrypoint", async () => {
    const { promise, fake } = await open(widget, {
      entrypoint: { type: "updateCredential", idCredential: "cred-1" }
    });

    expect(fake.openCalls).toBe(0);
    expect(fake.setEntrypointUpdateCredentialCalls).toEqual(["cred-1"]);

    fake.handlers.closed?.(undefined);
    await promise;
  });

  it("mounts a #widget container element in the document", async () => {
    const { promise, fake } = await open(widget);

    expect(document.getElementById("widget")).toBeInTheDocument();

    fake.handlers.closed?.(undefined);
    await promise;
  });
});
