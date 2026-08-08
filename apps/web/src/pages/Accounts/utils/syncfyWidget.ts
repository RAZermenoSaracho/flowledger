import type { ProviderConnectionFlow } from "@flowledger/shared";
import type {
  SyncfyWidgetConstructor,
  SyncfyWidgetEntrypoint,
  SyncfyWidgetResult
} from "../types/accounts.types";

function getRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function getString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function safeSyncfyCredentialSummary(credential: unknown) {
  const record = getRecord(credential);

  return {
    idCredential: getString(record.id_credential),
    status: getString(record.status),
    ws: getString(record.ws),
    isNew:
      typeof record.is_new === "boolean" || typeof record.is_new === "number"
        ? record.is_new
        : undefined,
    twofa:
      typeof record.twofa === "boolean" || typeof record.twofa === "number"
        ? record.twofa
        : undefined,
    hasUsername: Boolean(getString(record.username))
  };
}

function resetSyncfyWidgetContainer() {
  const existing = document.getElementById("widget");
  existing?.remove();

  const element = document.createElement("div");
  element.id = "widget";
  document.body.appendChild(element);

  return element;
}

/** Loads the Syncfy widget SDK, mounts its container, and opens the given connect/resync/update flow, resolving with the settled event. */
export async function openSyncfyWidget(
  widget: NonNullable<ProviderConnectionFlow["widget"]>,
  options: {
    entrypoint?: SyncfyWidgetEntrypoint;
    onSettled?: () => void | Promise<void>;
    onError?: (message: string) => void;
  } = {}
): Promise<SyncfyWidgetResult> {
  const syncfyGlobal = globalThis as typeof globalThis & {
    global?: typeof globalThis;
  };

  if (typeof syncfyGlobal.global === "undefined") {
    syncfyGlobal.global = globalThis;
  }

  resetSyncfyWidgetContainer();

  const module = (await import("@syncfy/authentication-widget/umd")) as {
    default: SyncfyWidgetConstructor;
  };

  return await new Promise<SyncfyWidgetResult>((resolve, reject) => {
    let completed = false;
    const syncfyWidget = new module.default({
      token: widget.token,
      element: "#widget",
      config: widget.config
    });

    const settle = (result: SyncfyWidgetResult) => {
      if (completed) return;
      completed = true;

      console.info("[SYNCFY WIDGET] Event", {
        event: result.event,
        credential: safeSyncfyCredentialSummary(result.credential)
      });
      void options.onSettled?.();
      resolve(result);
    };
    const fail = (
      event: "error" | "socket-error" | "api-error",
      message: string,
      credential?: unknown
    ) => {
      options.onError?.(message);
      settle({ event, credential });
    };

    syncfyWidget.on?.("success", (credential) =>
      settle({ event: "success", credential })
    );
    syncfyWidget.on?.("updated", (credential) =>
      settle({ event: "updated", credential })
    );
    syncfyWidget.on?.("closed", (credential) =>
      settle({ event: "closed", credential })
    );
    syncfyWidget.on?.("status", (status) => {
      console.info("[SYNCFY WIDGET] Status", {
        credential: safeSyncfyCredentialSummary(status)
      });
    });

    syncfyWidget.on?.("error", (credential) =>
      fail(
        "error",
        "Syncfy reported an error while processing the credential.",
        credential
      )
    );

    syncfyWidget.on?.("socket-error", (socketError) =>
      fail(
        "socket-error",
        "Syncfy connection failed while processing the credential.",
        socketError
      )
    );

    syncfyWidget.on?.("api-error", (_statusCode, apiError) =>
      fail(
        "api-error",
        "Syncfy API returned an error while processing the credential.",
        apiError
      )
    );

    try {
      if (options.entrypoint?.type === "credential") {
        if (!syncfyWidget.setEntrypointCredential) {
          throw new Error("Syncfy credential resync is unavailable.");
        }
        syncfyWidget.setEntrypointCredential(options.entrypoint.idCredential);
      } else if (options.entrypoint?.type === "updateCredential") {
        if (!syncfyWidget.setEntrypointUpdateCredential) {
          throw new Error("Syncfy credential update is unavailable.");
        }
        syncfyWidget.setEntrypointUpdateCredential(
          options.entrypoint.idCredential
        );
      } else {
        syncfyWidget.open();
      }
    } catch (error) {
      reject(error);
    }

    // Fallback cleanup: when user closes the widget with X,
    // Syncfy hides/removes UI but may leave Vue mounted.
    const observer = new MutationObserver(() => {
      const widgetElement = document.getElementById("widget");

      if (!widgetElement) {
        observer.disconnect();
        resetSyncfyWidgetContainer();
        return;
      }

      const hasVisibleWidgetContent = widgetElement.children.length > 0;

      if (!hasVisibleWidgetContent) {
        observer.disconnect();
        resetSyncfyWidgetContainer();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  });
}
