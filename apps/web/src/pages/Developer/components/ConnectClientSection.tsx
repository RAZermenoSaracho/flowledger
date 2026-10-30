import { API_URL } from "../../../services/api.client";
import { Card } from "../../../components/Card";

/** Static instructions for connecting an MCP client using the API's `/mcp` endpoint. */
export function ConnectClientSection() {
  const mcpUrl = `${API_URL}/mcp`;
  const codeClass =
    "mt-2 block overflow-x-auto rounded-md bg-slate-100 p-3 text-xs dark:bg-slate-800";

  return (
    <Card>
      <h3 className="text-lg font-semibold">Connect an AI client</h3>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        The MCP endpoint becomes available when the MCP server ships; these
        commands will work then.
      </p>
      <code className={codeClass}>
        {`claude mcp add --transport http flowledger ${mcpUrl}`}
      </code>
      <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
        Or authenticate with an API key:
      </p>
      <code className={codeClass}>
        {`claude mcp add --transport http flowledger ${mcpUrl} --header "Authorization: Bearer fl_..."`}
      </code>
    </Card>
  );
}
