import { useQuery } from "@tanstack/react-query";
import { ListView } from "../../components/ListView";
import { listNotificationLibrary } from "../../services/notificationModels.client";
import { LibraryEntryCard } from "./components/LibraryEntryCard";

/** Public Models tab: public notification models to browse, inspect read-only and install as a private copy. */
export function NotificationLibraryPage() {
  const library = useQuery({ queryKey: ["notification-library"], queryFn: async () => (await listNotificationLibrary()).data });

  return (
    <ListView
      title="Notification library"
      subtitle="Models published by other users."
      items={library.data ?? []}
      rowKey={(entry) => entry.modelId}
      renderItem={(entry) => <LibraryEntryCard entry={entry} />}
      isLoading={library.isLoading}
      error={library.error?.message}
      emptyText="No models have been published yet."
    />
  );
}
