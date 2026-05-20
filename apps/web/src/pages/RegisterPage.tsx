import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { TextInput } from "../components/FormField";
import { routes } from "../constants/routes";
import { useAuth } from "../hooks/useAuth";

export function RegisterPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await auth.register(name, email, password);
      navigate(routes.dashboard);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Registration failed");
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 px-4 dark:bg-slate-950">
      <Card className="w-full max-w-md">
        <h1 className="text-2xl font-bold">Create account</h1>
        <form className="mt-6 grid gap-4" onSubmit={submit}>
          <TextInput label="Name" value={name} onChange={(event) => setName(event.target.value)} required />
          <TextInput label="Email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          <TextInput
            label="Password"
            type="password"
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
          {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
          <Button type="submit">Create account</Button>
        </form>
        <p className="mt-4 text-sm text-slate-600 dark:text-slate-300">
          Already registered?{" "}
          <Link className="font-semibold text-pine dark:text-emerald-300" to={routes.login}>
            Sign in
          </Link>
        </p>
      </Card>
    </main>
  );
}
