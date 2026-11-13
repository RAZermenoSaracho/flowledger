import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ActionMenuItem } from "../../components/ActionMenu";
import { Card } from "../../components/Card";
import { FormView } from "../../components/FormView";
import { routes } from "../../constants/routes";
import * as notificationModelsClient from "../../services/notificationModels.client";
import type { FormViewTab } from "../../types/common.types";
import { ModelCodeTab } from "./components/ModelCodeTab";
import { ModelFormTab } from "./components/ModelFormTab";
import { ModelPlaygroundTab } from "./components/ModelPlaygroundTab";
import { NotificationLogsList } from "./components/NotificationLogsList";
import { NotificationQueueList } from "./components/NotificationQueueList";
import { publicationLabel } from "./utils/notificationDisplay";
import { useNotificationModelForm } from "./hooks/useNotificationModelForm";

const SAVE_FIRST = <p className="text-sm text-slate-500 dark:text-slate-400">Save the model first.</p>;

/**
 * Notification model Form View at `/notification-models/:id` (stored model) and `/notification-models/new`
 * (unsaved draft from the template script). Tabs Form, Code, Playground, Queue and Logs share one draft,
 * selected through `?tab=`. The actions menu publishes (after a confirm listing what is published), unpublishes
 * (after a confirm; only when published) and deletes (after a confirm stating the pending runs). Unknown or foreign ids show the same not-found state.
 */
export function NotificationModelDetailPage() {
  const { id } = useParams();
  const isNew = !id;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);

  const modelQuery = useQuery({
    queryKey: ["notification-models", id, "detail"],
    enabled: !isNew,
    queryFn: async () => (await notificationModelsClient.getNotificationModel(id!)).model
  });
  const model = modelQuery.data ?? null;
  const draft = useNotificationModelForm(model, isNew);

  const deleteModel = useMutation({
    mutationFn: () => notificationModelsClient.deleteNotificationModel(id!),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["notification-models"] });
      navigate(routes.notificationModels);
    },
    onError: (error) => setActionError(error.message)
  });
  const refreshPublication = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["notification-models"] }),
      queryClient.invalidateQueries({ queryKey: ["notification-library"] })
    ]);
  };
  const publishModel = useMutation({
    mutationFn: () => notificationModelsClient.publishNotificationModel(id!),
    onSuccess: refreshPublication,
    onError: (error) => setActionError(error.message)
  });
  const unpublishModel = useMutation({
    mutationFn: () => notificationModelsClient.unpublishNotificationModel(id!),
    onSuccess: refreshPublication,
    onError: (error) => setActionError(error.message)
  });

  if (!isNew && modelQuery.isError) {
    return (
      <Card>
        <h1 className="text-xl font-semibold">Notification model not found</h1>
        <Link to={routes.notificationModels} className="text-pine underline">
          Back to notification models
        </Link>
      </Card>
    );
  }
  if (!isNew && !model) return <Card>Loading...</Card>;

  function confirmDelete() {
    if (!model) return;
    const pending = (model.queued ?? 0) + (model.processing ?? 0);
    const confirmed = window.confirm(
      `Delete "${model.name}"? It has ${pending} pending ${pending === 1 ? "run" : "runs"}. Deleting the model removes its queue and logs. This cannot be undone.`
    );
    if (confirmed) {
      setActionError(null);
      deleteModel.mutate();
    }
  }

  function confirmPublish() {
    if (!model) return;
    const confirmed = window.confirm(
      `Publish "${model.name}" to the library? Its name, description, code, slots and settings will be published. Bindings are not published.`
    );
    if (confirmed) {
      setActionError(null);
      publishModel.mutate();
    }
  }

  function confirmUnpublish() {
    if (!model) return;
    const confirmed = window.confirm(
      `Unpublish "${model.name}"? It will disappear from the library. Published versions and copies others already installed are kept.`
    );
    if (confirmed) {
      setActionError(null);
      unpublishModel.mutate();
    }
  }

  const tabs: FormViewTab[] = [
    { id: "form", label: "Form", content: <ModelFormTab draft={draft} model={model} /> },
    { id: "code", label: "Code", content: <ModelCodeTab draft={draft} /> },
    { id: "playground", label: "Playground", content: <ModelPlaygroundTab modelId={model?.id ?? null} draft={draft} /> },
    { id: "queue", label: "Queue", content: model ? <NotificationQueueList modelId={model.id} /> : SAVE_FIRST },
    { id: "logs", label: "Logs", content: model ? <NotificationLogsList modelId={model.id} /> : SAVE_FIRST }
  ];

  return (
    <Card>
      <FormView
        title={model ? model.name : "New notification model"}
        subtitle={model ? `${model.isActive ? "Active" : "Inactive"} · ${publicationLabel(model.publication)}` : undefined}
        draft={draft}
        tabs={tabs}
        backLink={{ to: routes.notificationModels, label: "Back to notification models" }}
        isNew={isNew}
        actions={
          model ? (
            <>
              <ActionMenuItem disabled={publishModel.isPending || draft.isDirty} onClick={confirmPublish}>
                Publish
              </ActionMenuItem>
              {model.publication.published ? (
                <ActionMenuItem disabled={unpublishModel.isPending} onClick={confirmUnpublish}>
                  Unpublish
                </ActionMenuItem>
              ) : null}
              <ActionMenuItem variant="danger" disabled={deleteModel.isPending} onClick={confirmDelete}>
                Delete
              </ActionMenuItem>
            </>
          ) : undefined
        }
      >
        {actionError ? (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {actionError}
          </p>
        ) : null}
      </FormView>
    </Card>
  );
}
