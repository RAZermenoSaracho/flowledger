/** A mobile-drawer nav item that expands in place into `?tab=` sub-pages instead of linking straight to its base route. */
export type MobileExpandableNavConfig = {
  basePath: string;
  defaultTab: string;
  subPages: readonly { tab: string; label: string }[];
};
