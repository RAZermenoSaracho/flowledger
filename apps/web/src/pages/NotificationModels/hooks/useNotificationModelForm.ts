import { useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { routes } from "../../../constants/routes";
import { useFormDraft } from "../../../hooks/useFormDraft";
import * as notificationModelsClient from "../../../services/notificationModels.client";
import type { NotificationModel } from "../../../types/notificationModels.types";
import type { NotificationModelDraft } from "../types/notificationModels.types";
import { NEW_MODEL_CODE, NEW_MODEL_SLOTS } from "../utils/modelTemplate";
import { validateNotificationModelDraft } from "../utils/modelValidation";

/** Draft a stored model starts from. */
function draftFromModel(model: NotificationModel): NotificationModelDraft {
  return {
    name: model.name,
    description: model.description ?? "",
    code: model.code,
    isActive: model.isActive,
    slots: model.slots,
    bindings: model.bindings,
    settings: model.settings
  };
}

/** Draft of `/notification-models/new`: inactive, with the commented template script and its slots. */
const NEW_DRAFT: NotificationModelDraft = {
  name: "",
  description: "",
  code: NEW_MODEL_CODE,
  isActive: false,
  slots: NEW_MODEL_SLOTS,
  bindings: {},
  settings: {}
};

/**
 * Notification model adapter over `useFormDraft`, shared by all five tabs. `model` is the stored
 * model (`null` while loading or for a new one); with `isNew` the draft starts from the template.
 * Saving sends one request with the changed fields (everything, when creating), invalidates
 * `notification-models`, and after a create replaces the URL with the new model's. A save
 * rejection keeps the draft; script errors carry their line and are addressed to `code`.
 */
export function useNotificationModelForm(model: NotificationModel | null, isNew: boolean) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const initial = useMemo<NotificationModelDraft | null>(
    () => (model ? draftFromModel(model) : isNew ? NEW_DRAFT : null),
    [model, isNew]
  );

  return useFormDraft<NotificationModelDraft>({
    initial,
    validate: validateNotificationModelDraft,
    save: async (values, changedKeys) => {
      const body = {
        name: values.name.trim(),
        description: values.description.trim() || null,
        code: values.code,
        isActive: values.isActive,
        slots: values.slots,
        bindings: values.bindings,
        settings: values.settings
      };
      if (!model) {
        const { model: created } = await notificationModelsClient.createNotificationModel(body);
        await queryClient.invalidateQueries({ queryKey: ["notification-models"] });
        navigate(routes.notificationModel(created.id), { replace: true });
        return;
      }
      const patch = Object.fromEntries(changedKeys.map((key) => [key, body[key]]));
      await notificationModelsClient.updateNotificationModel(model.id, patch);
      await queryClient.invalidateQueries({ queryKey: ["notification-models"] });
    }
  });
}
