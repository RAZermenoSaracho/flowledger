import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ListView } from "../../components/ListView";
import { routes } from "../../constants/routes";
import { listNotificationLibrary } from "../../services/notificationModels.client";
import { LibraryEntryCard } from "./components/LibraryEntryCard";

/** Library at `/notification-library`: public notification models to browse, inspect read-only and install as a private copy. */
export function NotificationLibraryPage() {
  const library = useQuery({ queryKey: ["notification-library"], queryFn: async () => (await listNotificationLibrary()).data });

  return (
    <ListView
      title="Notification library"
      subtitle="Models published by other users."
      actions={
        <Link className="text-sm text-pine underline" to={routes.notificationModels}>
          My models
        </Link>
      }
      items={library.data ?? []}
      rowKey={(entry) => entry.modelId}
      renderItem={(entry) => <LibraryEntryCard entry={entry} />}
      isLoading={library.isLoading}
      error={library.error?.message}
      emptyText="No models have been published yet."
    />
  );
}
