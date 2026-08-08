/** Constructor for the Syncfy authentication widget SDK, loaded dynamically at runtime. */
export type SyncfyWidgetConstructor = new (params: {
  token: string;
  element: string;
  config: Record<string, unknown>;
}) => {
  open: () => void;
  on?: (eventName: string, callback: (...args: unknown[]) => void) => void;
  setEntrypointCredential?: (idCredential: string) => void;
  setEntrypointUpdateCredential?: (idCredential: string) => void;
};

/** Which flow the Syncfy widget should open into: fresh connect, credential resync, or credential update. */
export type SyncfyWidgetEntrypoint =
  | { type: "connect" }
  | { type: "credential"; idCredential: string }
  | { type: "updateCredential"; idCredential: string };

/** Event/result payload the Syncfy widget reports back when a flow settles. */
export type SyncfyWidgetResult =
  | { event: "success" | "updated" | "closed"; credential?: unknown }
  | { event: "error" | "socket-error" | "api-error"; credential?: unknown };
