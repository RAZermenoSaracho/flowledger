import { useQuery } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { Card } from "../../../components/Card";
import { CopyButton } from "../../../components/CopyButton";
import { Tabs } from "../../../components/Tabs";
import { getMuseClientDocument } from "../../../services/oauth.client";
import { API_URL } from "../../../services/api.client";

const noteClass = "mt-3 text-sm text-slate-500 dark:text-slate-400";
const listClass = "list-decimal space-y-2 pl-5 text-sm text-slate-600 dark:text-slate-300";

function CopyRow({ label, value, copyLabel }: { label: string; value: string; copyLabel: string }) {
  return (
    <div className="mt-3 grid gap-1">
      <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</span>
      <div className="flex flex-wrap items-center gap-2">
        <code className="min-w-0 flex-1 break-all rounded-md bg-slate-100 p-2 text-xs dark:bg-slate-800">
          {value}
        </code>
        <CopyButton value={value} label={copyLabel} />
      </div>
    </div>
  );
}

function ClientBlock({ children }: { children: ReactNode }) {
  return <div className="grid gap-1">{children}</div>;
}

function MuseClientId() {
  const { data, isPending } = useQuery({ queryKey: ["oauth", "muse-client"], queryFn: getMuseClientDocument, retry: false });
  if (isPending) return <p className={noteClass}>Loading Client ID…</p>;
  if (!data) {
    return (
      <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">
        Client ID unavailable — the API did not return the Muse client document. Try again later.
      </p>
    );
  }
  return <CopyRow label="OAuth Client ID" value={data.client_id} copyLabel="Copy Client ID" />;
}

function ChatGptTab({ mcpUrl }: { mcpUrl: string }) {
  return (
    <ClientBlock>
      <ol className={listClass}>
        <li>
          In ChatGPT open Settings → Apps → Advanced settings and enable Developer mode (availability depends on
          your ChatGPT plan).
        </li>
        <li>Create an app/connector named FlowLedger with the MCP server URL below and authentication set to OAuth.</li>
        <li>
          Sign in to FlowLedger when prompted and approve on the consent page (tick "Allow changes" for write).
        </li>
        <li>
          Verify: in a new chat ask "List my FlowLedger accounts" — it should call <code>list_accounts</code> and
          show your accounts.
        </li>
      </ol>
      <CopyRow label="MCP server URL" value={mcpUrl} copyLabel="Copy MCP URL" />
    </ClientBlock>
  );
}

function ClaudeWebTab({ mcpUrl }: { mcpUrl: string }) {
  return (
    <ClientBlock>
      <ol className={listClass}>
        <li>
          In Claude (web or desktop) go to Customize → Connectors, click "+ Add" and choose "Add custom connector".
          On Team and Enterprise an owner adds it under Organization settings → Connectors (Add → Custom → Web), then
          members click Connect. Free plans allow one custom connector.
        </li>
        <li>Name it FlowLedger and enter the MCP server URL below, then Continue.</li>
        <li>
          Keep OAuth sign-in and choose "Use Claude's published identity". FlowLedger does not support "Register
          automatically".
        </li>
        <li>Connect, sign in to FlowLedger and approve; tick "Allow changes" for read and write.</li>
        <li>
          In a conversation, enable FlowLedger under "+" → Connectors, then verify by asking "List my FlowLedger
          accounts".
        </li>
      </ol>
      <CopyRow label="MCP server URL" value={mcpUrl} copyLabel="Copy MCP URL" />
    </ClientBlock>
  );
}

function ClaudeTab({ mcpUrl }: { mcpUrl: string }) {
  const [option, setOption] = useState("web");
  return (
    <Tabs
      compact
      idPrefix="connect-claude-"
      activeId={option}
      onSelect={setOption}
      tabs={[
        { id: "web", label: "Claude Web / Desktop", content: <ClaudeWebTab mcpUrl={mcpUrl} /> },
        { id: "code", label: "Claude Code", content: <ClaudeCodeTab mcpUrl={mcpUrl} /> }
      ]}
    />
  );
}

function ClaudeCodeTab({ mcpUrl }: { mcpUrl: string }) {
  return (
    <ClientBlock>
      <CopyRow
        label="Add the server"
        value={`claude mcp add --transport http flowledger ${mcpUrl}`}
        copyLabel="Copy command"
      />
      <p className={noteClass}>
        Then run <code>/mcp</code> in Claude Code, select flowledger, choose Authenticate and approve in the browser
        (tick "Allow changes" for write).
      </p>
      <CopyRow label="Verify it is connected" value="claude mcp list" copyLabel="Copy verify command" />
      <p className={noteClass}>
        It should show flowledger as connected; then ask "List my FlowLedger accounts".
      </p>
      <CopyRow
        label="Alternative: API key"
        value={`claude mcp add --transport http flowledger ${mcpUrl} --header "Authorization: Bearer fl_..."`}
        copyLabel="Copy API key command"
      />
      <p className={noteClass}>
        Create the key under Personal API keys above; a read key exposes only read tools.
      </p>
    </ClientBlock>
  );
}

function MuseTab({ mcpUrl }: { mcpUrl: string }) {
  return (
    <ClientBlock>
      <p className="text-sm text-slate-600 dark:text-slate-300">
        Muse asks for an OAuth Client ID when adding a custom connector. FlowLedger publishes a public client
        document for Muse and its URL is the Client ID — a public identifier, not a secret; there is no client secret.
      </p>
      <CopyRow label="MCP server URL" value={mcpUrl} copyLabel="Copy MCP URL" />
      <MuseClientId />
      <CopyRow
        label="Scopes (omit write for read-only)"
        value="read write offline_access"
        copyLabel="Copy scopes"
      />
      <ol className={`${listClass} mt-4`}>
        <li>In Muse, add a custom connector and enter the MCP server URL.</li>
        <li>Paste the Client ID into the connector's OAuth Client ID field; leave the client secret empty.</li>
        <li>Enter the scopes.</li>
        <li>
          Connect, sign in to FlowLedger and approve; "Allow changes" appears only if write was requested.
        </li>
        <li>Verify: ask Muse "List my FlowLedger accounts".</li>
      </ol>
      <p className={noteClass}>
        Meta controls which connectors and tools Muse may use; connector submission, approval or tool permissions may
        be required on Meta's side.
      </p>
    </ClientBlock>
  );
}

function GrokTab({ mcpUrl }: { mcpUrl: string }) {
  return (
    <ClientBlock>
      <ol className={listClass}>
        <li>
          In Grok on the web, open the connectors settings and add a custom MCP connector (custom connectors may not
          be available on every Grok account or plan).
        </li>
        <li>Enter the MCP server URL below; Grok registers itself automatically (no Client ID needed).</li>
        <li>Sign in to FlowLedger and approve; tick "Allow changes" for read and write.</li>
        <li>Verify: ask Grok "List my FlowLedger accounts" or check the connector's tool list.</li>
      </ol>
      <CopyRow label="MCP server URL" value={mcpUrl} copyLabel="Copy MCP URL" />
      <p className={noteClass}>
        For the xAI API (not grok.com) use a personal API key as the MCP tool's authorization bearer — see Personal
        API keys.
      </p>
    </ClientBlock>
  );
}

/** Collapsible per-client instructions (ChatGPT, Claude web/desktop and Code, Meta AI Muse, Grok) for connecting an MCP client to the API's `/mcp` endpoint. The Muse Client ID is fetched only while its tab is shown. */
export function ConnectClientSection() {
  const mcpUrl = `${API_URL}/mcp`;
  const [activeId, setActiveId] = useState("chatgpt");

  return (
    <Card>
      <details>
        <summary className="cursor-pointer text-base font-semibold">Connect an AI client</summary>
        <p className={noteClass}>
          Permissions: FlowLedger always grants Read. The consent page offers "Allow changes" (Read + Write) only when
          the AI client requests the write scope; leave it unticked for read-only. You also choose how long access
          lasts, and can revoke it anytime in Connected apps above.
        </p>
        <div className="mt-3">
          <Tabs
            compact
            idPrefix="connect-"
            activeId={activeId}
            onSelect={setActiveId}
            tabs={[
              { id: "chatgpt", label: "ChatGPT", content: <ChatGptTab mcpUrl={mcpUrl} /> },
              { id: "claude", label: "Claude", content: <ClaudeTab mcpUrl={mcpUrl} /> },
              { id: "muse", label: "Meta AI Muse", content: <MuseTab mcpUrl={mcpUrl} /> },
              { id: "grok", label: "Grok", content: <GrokTab mcpUrl={mcpUrl} /> }
            ]}
          />
        </div>
      </details>
    </Card>
  );
}
