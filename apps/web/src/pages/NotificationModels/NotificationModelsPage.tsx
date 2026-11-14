import { useSearchParams } from "react-router-dom";
import { Tabs } from "../../components/Tabs";
import { MyModelsList } from "./components/MyModelsList";
import { NotificationLibraryPage } from "./NotificationLibraryPage";

type NotificationModelsTab = "my" | "public";

const notificationModelsTabs: { id: NotificationModelsTab; label: string }[] = [
  { id: "my", label: "My Models" },
  { id: "public", label: "Public Models" }
];

/**
 * Notification models page at `/notification-models`: a desktop section strip switching between the
 * user's models and the public library. The `?tab=` param is the source of truth (`my` when absent or
 * invalid), written by both the strip and the mobile drawer's submenu links.
 */
export function NotificationModelsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get("tab");
  const activeTab: NotificationModelsTab = requested === "public" ? "public" : "my";
  const content = { my: <MyModelsList />, public: <NotificationLibraryPage /> };

  return (
    <div className="grid gap-6">
      <Tabs
        label="Notification model views"
        variant="buttons"
        desktopOnly
        idPrefix="notification-models-"
        activeId={activeTab}
        onSelect={(id) =>
          setSearchParams((current) => {
            const next = new URLSearchParams(current);
            next.set("tab", id);
            return next;
          })
        }
        tabs={notificationModelsTabs.map((tab) => ({ ...tab, content: content[tab.id] }))}
      />
    </div>
  );
}
