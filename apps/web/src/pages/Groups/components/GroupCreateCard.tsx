import { FormEvent } from "react";
import { Button } from "../../../components/Button";
import { Card } from "../../../components/Card";
import { TextArea, TextInput } from "../../../components/FormField";

/** Form card for creating a new group. */
export function GroupCreateCard({
  isCreateOpen,
  onOpen,
  onClose,
  name,
  onNameChange,
  description,
  onDescriptionChange,
  onSubmit,
  isSaving
}: {
  isCreateOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  name: string;
  onNameChange: (value: string) => void;
  description: string;
  onDescriptionChange: (value: string) => void;
  onSubmit: (event: FormEvent) => Promise<void>;
  isSaving: boolean;
}) {
  return (
    <Card>
      {isCreateOpen ? (
        <>
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <h2 className="text-lg font-semibold">New group</h2>
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
          </div>
          <form className="mt-4 grid gap-4" onSubmit={onSubmit}>
            <TextInput
              label="Name"
              value={name}
              onChange={(event) => onNameChange(event.target.value)}
              placeholder="Home, Roommates, Trip group"
              required
            />
            <TextArea
              label="Description"
              value={description}
              onChange={(event) => onDescriptionChange(event.target.value)}
            />
            <Button type="submit" disabled={isSaving}>
              Save group
            </Button>
          </form>
        </>
      ) : (
        <Button type="button" className="w-full sm:w-auto" onClick={onOpen}>
          Add group
        </Button>
      )}
    </Card>
  );
}
