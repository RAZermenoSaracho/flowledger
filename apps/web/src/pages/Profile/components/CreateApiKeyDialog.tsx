import type { CreateApiKeyInput } from "@flowledger/shared";
import { ModalDialog } from "./ModalDialog";
import { CreateApiKeyForm } from "./CreateApiKeyForm";

/**
 * Modal wrapping `CreateApiKeyForm`. Mount it only while open so form state resets on
 * each open; Escape and Cancel call `onCancel`. The parent closes it after `onSubmit` resolves.
 */
export function CreateApiKeyDialog({
  onSubmit,
  onCancel,
  disabled
}: {
  onSubmit: (input: CreateApiKeyInput) => Promise<void>;
  onCancel: () => void;
  disabled?: boolean;
}) {
  return (
    <ModalDialog
      titleId="create-key-title"
      title="Create API key"
      titleClassName="mb-4 text-lg font-semibold"
      onCancel={onCancel}
    >
      <CreateApiKeyForm onSubmit={onSubmit} onCancel={onCancel} disabled={disabled} />
    </ModalDialog>
  );
}
