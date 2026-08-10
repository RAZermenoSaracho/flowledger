import { Link } from "react-router-dom";
import { BrandLogo } from "../../components/BrandLogo";
import { routes } from "../../constants/routes";

/** Logo link to the dashboard, used by both the desktop sidebar and the mobile header. */
export function BrandLink({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <Link
      to={routes.dashboard}
      onClick={onNavigate}
      className="inline-block rounded-md focus:outline-none focus:ring-2 focus:ring-pine focus:ring-offset-2 dark:focus:ring-offset-slate-950"
      aria-label="Go to Dashboard"
    >
      <BrandLogo />
      <h1 className="sr-only">FlowLedger</h1>
    </Link>
  );
}
