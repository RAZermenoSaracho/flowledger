import { BrandLink } from "./BrandLink";
import { NotificationsMenu } from "./NotificationsMenu";

/** Sticky top bar: shows the brand link on mobile/tablet only (the desktop sidebar already carries it) plus the notifications menu. */
export function AppHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
        <div className="lg:hidden">
          <BrandLink />
        </div>
        <div className="ml-auto">
          <NotificationsMenu />
        </div>
      </div>
    </header>
  );
}
