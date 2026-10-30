import { API_URL } from "../../../services/api.client";
import { Card } from "../../../components/Card";

/** Static instructions for connecting an MCP client using the API's `/mcp` endpoint. */
export function ConnectClientSection() {
  const mcpUrl = `${API_URL}/mcp`;
  const codeClass =
    "mt-2 block overflow-x-auto rounded-md bg-slate-100 p-3 text-xs dark:bg-slate-800";

  return (
    <Card>
      <details>
        <summary className="cursor-pointer text-base font-semibold">
          Connect an AI client (ChatGPT, Claude Code)
        </summary>
        <h4 className="mt-3 font-medium">ChatGPT</h4>
        <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm text-slate-500 dark:text-slate-400">
          <li>In ChatGPT, enable Developer mode (Settings → Apps → Advanced settings).</li>
          <li>
            Create an app/connector with the MCP server URL <code>{mcpUrl}</code> and authentication set
            to OAuth.
          </li>
          <li>
            Sign in and approve on the FlowLedger consent page: pick the permissions and the
            lifetime.
          </li>
        </ol>
        <h4 className="mt-4 font-medium">Claude Code</h4>
        <code className={codeClass}>
          {`claude mcp add --transport http flowledger ${mcpUrl}`}
        </code>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          Then run <code>/mcp</code> in Claude Code to sign in via OAuth.
        </p>
        <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
          Alternatively, authenticate with an API key:
        </p>
        <code className={codeClass}>
          {`claude mcp add --transport http flowledger ${mcpUrl} --header "Authorization: Bearer fl_..."`}
        </code>
      </details>
    </Card>
  );
}
