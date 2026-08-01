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

export type SyncfyWidgetEntrypoint =
  | { type: "connect" }
  | { type: "credential"; idCredential: string }
  | { type: "updateCredential"; idCredential: string };

export type SyncfyWidgetResult =
  | { event: "success" | "updated" | "closed"; credential?: unknown }
  | { event: "error" | "socket-error" | "api-error"; credential?: unknown };
