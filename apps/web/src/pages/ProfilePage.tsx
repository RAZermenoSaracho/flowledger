import { Card } from "../components/Card";
import { useAuth } from "../hooks/useAuth";

export function ProfilePage() {
  const auth = useAuth();

  return (
    <Card>
      <h2 className="text-lg font-semibold">Profile</h2>
      <dl className="mt-4 grid gap-3 text-sm">
        <div>
          <dt className="font-medium text-slate-500">Email</dt>
          <dd className="mt-1 text-ink">{auth.user?.email ?? "Loading..."}</dd>
        </div>
      </dl>
    </Card>
  );
}
