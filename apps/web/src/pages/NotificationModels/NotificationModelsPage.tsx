import { Link, useNavigate } from "react-router-dom";
import { AddRecordButton } from "../../components/AddRecordButton";
import { ListView } from "../../components/ListView";
import { routes } from "../../constants/routes";
import { usePagination } from "../../hooks/usePagination";
import * as notificationModelsClient from "../../services/notificationModels.client";
import { NotificationModelListItem } from "./components/NotificationModelListItem";

/** Notification models list at `/notification-models`: a server-paginated `ListView` whose rows open the model, with a New button. */
export function NotificationModelsPage() {
  const navigate = useNavigate();
  const list = usePagination({
    queryKey: ["notification-models"],
    resetKey: "notification-models",
    defaultLimit: 20,
    storageKey: "notification-models",
    fetchPage: async (pagination) => {
      const { data, meta } = await notificationModelsClient.listNotificationModels(pagination);
      return { items: data, total: meta.total, hasNext: meta.hasNext };
    }
  });

  return (
    <ListView
      title="Notification models"
      subtitle="Scripts that turn bank notification text into transactions."
      actions={<AddRecordButton label="model" onClick={() => navigate(routes.newNotificationModel)} />}
      items={list.items}
      rowKey={(model) => model.id}
      renderItem={(model) => <NotificationModelListItem model={model} />}
      isLoading={list.isLoading}
      error={list.error}
      emptyText={
        <>
          No notification models yet. <Link className="text-pine underline" to={routes.newNotificationModel}>Create one</Link>.
        </>
      }
      pager={list.pager}
    />
  );
}
