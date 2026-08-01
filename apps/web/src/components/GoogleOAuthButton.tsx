import { routes } from "../constants/routes";
import { googleOAuthUrl } from "../services/auth.client";
import { GoogleIcon } from "./GoogleIcon";

type GoogleOAuthButtonProps = {
  redirect?: string;
};

export function GoogleOAuthButton({ redirect = routes.dashboard }: GoogleOAuthButtonProps) {
  return (
    <button
      className="flex min-h-11 w-full items-center justify-center gap-3 rounded-md bg-white px-4 py-2.5 text-sm font-semibold text-ink shadow-sm ring-1 ring-slate-200 transition hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine active:bg-slate-100 dark:bg-slate-900 dark:text-slate-100 dark:ring-slate-700 dark:hover:bg-slate-800 dark:active:bg-slate-800"
      type="button"
      onClick={() => {
        window.location.href = googleOAuthUrl(redirect);
      }}
    >
      <GoogleIcon />
      <span>Continue with Google</span>
    </button>
  );
}
