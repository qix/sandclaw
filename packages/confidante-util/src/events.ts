// --- ANSI helpers ---

const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";
const YELLOW = "\x1b[33m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const CYAN = "\x1b[36m";
const GRAY = "\x1b[90m";

function styled(text: string, ...codes: string[]) {
  return `${codes.join("")}${text}${RESET}`;
}

function write(text: string) {
  process.stderr.write(text + "\n");
}

function writeInline(text: string) {
  process.stderr.write(text);
}

// --- Tool display ---

const PREVIEW_LINES = 12;

const TOOL_EMOJI: Record<string, string> = {
  exec: "\u{1F6E0}\uFE0F",
  read: "\u{1F4D6}",
  write: "\u{270F}\uFE0F",
  edit: "\u{270F}\uFE0F",
  glob: "\u{1F50D}",
  grep: "\u{1F50E}",
  web_search: "\u{1F50E}",
  web_fetch: "\u{1F4C4}",
  apply_patch: "\u{1FA79}",
  attach: "\u{1F4CE}",
  message: "\u{2709}\uFE0F",
  memory_search: "\u{1F9E0}",
  memory_get: "\u{1F4D3}",
  sessions_spawn: "\u{1F9D1}\u200D\u{1F527}",
  sessions_send: "\u{1F4E8}",
  sessions_history: "\u{1F9FE}",
  sessions_list: "\u{1F5C2}\uFE0F",
  subagents: "\u{1F916}",
  agents_list: "\u{1F9ED}",
};

const TOOL_LABEL: Record<string, string> = {
  exec: "Exec",
  read: "Read",
  write: "Write",
  edit: "Edit",
  glob: "Glob",
  grep: "Grep",
  web_search: "Web Search",
  web_fetch: "Web Fetch",
  apply_patch: "Apply Patch",
  attach: "Attach",
  message: "Message",
  memory_search: "Memory Search",
  memory_get: "Memory Get",
  sessions_spawn: "Sub-agent",
  sessions_send: "Session Send",
  sessions_history: "Session History",
  sessions_list: "Sessions",
  subagents: "Subagents",
  agents_list: "Agents",
};

function toolHeader(name: string): string {
  const key = name.toLowerCase();
  const emoji = TOOL_EMOJI[key] ?? "\u{1F9E9}";
  const label = TOOL_LABEL[key] ?? defaultTitle(name);
  return `${emoji} ${styled(label, BOLD, YELLOW)}`;
}

function defaultTitle(name: string): string {
  return name
    .replace(/_/g, " ")
    .split(/\s+/)
    .map((w) =>
      w.length <= 2 && w === w.toUpperCase()
        ? w
        : w[0].toUpperCase() + w.slice(1),
    )
    .join(" ");
}

// --- Arg formatting ---

function formatToolArgs(name: string, args: unknown): string {
  if (!args || typeof args !== "object") return "";
  const record = args as Record<string, unknown>;
  const key = name.toLowerCase();

  if (key === "read") {
    return formatPath(record) ?? "";
  }
  if (key === "write" || key === "edit") {
    return formatWriteArgs(record) ?? "";
  }
  if (key === "exec") {
    return formatExecArgs(record) ?? "";
  }
  if (key === "glob") {
    const pattern = str(record.pattern);
    const path = str(record.path);
    if (pattern && path) return `${pattern} in ${path}`;
    return pattern ?? "";
  }
  if (key === "grep") {
    const pattern = str(record.pattern);
    const path = str(record.path);
    if (pattern && path) return `"${pattern}" in ${path}`;
    return pattern ? `"${pattern}"` : "";
  }
  if (key === "web_search") {
    const query = str(record.query);
    return query ? `for "${query}"` : "";
  }
  if (key === "web_fetch") {
    return str(record.url) ?? "";
  }
  if (key === "apply_patch") {
    const patch = str(record.patch);
    if (patch) {
      // Extract file paths from patch
      const files = [...patch.matchAll(/^[-+]{3}\s+[ab]\/(.+)$/gm)].map(
        (m) => m[1],
      );
      const unique = [...new Set(files)];
      if (unique.length > 0) return unique.join(", ");
    }
    return "";
  }
  if (key === "sessions_spawn") {
    const label = str(record.label);
    const agent = str(record.agentId);
    const parts = [label, agent ? `agent: ${agent}` : undefined].filter(
      Boolean,
    );
    return parts.join(", ");
  }
  if (key === "message") {
    const action = str(record.action);
    const to = str(record.to);
    const parts = [action, to].filter(Boolean);
    return parts.join(" \u2192 ");
  }

  // Generic: show first few meaningful keys
  return formatGenericArgs(record);
}

function str(v: unknown): string | undefined {
  if (typeof v === "string") {
    const t = v.trim();
    return t || undefined;
  }
  return undefined;
}

function formatPath(record: Record<string, unknown>): string | undefined {
  const path =
    str(record.path) ?? str(record.file_path) ?? str(record.filePath);
  if (!path) return undefined;

  const offset =
    typeof record.offset === "number" && Number.isFinite(record.offset)
      ? Math.max(1, Math.floor(record.offset))
      : undefined;
  const limit =
    typeof record.limit === "number" && Number.isFinite(record.limit)
      ? Math.max(1, Math.floor(record.limit))
      : undefined;

  if (offset && limit)
    return `lines ${offset}-${offset + limit - 1} from ${path}`;
  if (offset) return `from line ${offset} in ${path}`;
  if (limit) return `first ${limit} lines of ${path}`;
  return path;
}

function formatWriteArgs(record: Record<string, unknown>): string | undefined {
  const path =
    str(record.path) ?? str(record.file_path) ?? str(record.filePath);
  if (!path) return undefined;
  const content =
    str(record.content) ?? str(record.newText) ?? str(record.new_string);
  if (content) return `${path} (${content.length} chars)`;
  return path;
}

function formatExecArgs(record: Record<string, unknown>): string | undefined {
  const command = str(record.command);
  if (!command) return undefined;
  // Collapse whitespace, truncate
  const compact = command
    .replace(/\s*\n\s*/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (compact.length > 120) return compact.slice(0, 119) + "\u2026";
  return compact;
}

function formatGenericArgs(record: Record<string, unknown>): string {
  const entries: string[] = [];
  for (const [k, v] of Object.entries(record)) {
    if (entries.length >= 3) break;
    if (v === null || v === undefined) continue;
    if (typeof v === "string") {
      const t = v.trim();
      if (!t) continue;
      const display = t.length > 60 ? t.slice(0, 59) + "\u2026" : t;
      entries.push(`${k}: ${display}`);
    } else if (typeof v === "number" || typeof v === "boolean") {
      entries.push(`${k}: ${v}`);
    }
  }
  return entries.join(", ");
}

// --- Result formatting ---

function formatToolResult(
  toolName: string,
  result: { content?: Array<{ type?: string; text?: string }> } | undefined,
  isError: boolean,
): string {
  if (!result?.content) return "";
  const lines: string[] = [];
  for (const entry of result.content) {
    if (entry.type === "text" && entry.text) {
      lines.push(entry.text);
    }
  }
  const text = lines.join("\n").trim();
  if (!text) return "";

  const allLines = text.split("\n");
  if (allLines.length <= PREVIEW_LINES) return text;
  return (
    allLines.slice(0, PREVIEW_LINES).join("\n") +
    `\n${styled(`... (${allLines.length - PREVIEW_LINES} more lines)`, DIM)}`
  );
}

// --- Thinking formatting ---

function formatThinkingLine(text: string): string {
  // Dim the thinking text
  return styled(text, DIM);
}

/**
 * Tracks streaming pi events, pretty-prints them to stderr,
 * and captures the final assistant reply.
 */
export class PiEventPrinter {
  private needsNewline = false;
  private currentStopReason = "";
  private inThinking = false;
  private turnCount = 0;
  finalReply = "";

  private ensureNewline() {
    if (this.needsNewline) {
      process.stderr.write("\n");
      this.needsNewline = false;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handleEvent(event: any): void {
    switch (event.type) {
      case "session":
        write(
          styled(`Session ${event.id}`, DIM) +
            styled(` v${event.version} cwd=${event.cwd}`, GRAY),
        );
        break;

      case "agent_start":
        write(styled("Agent started", DIM));
        break;

      case "turn_start":
        this.ensureNewline();
        this.turnCount++;
        write("");
        write(
          styled(
            `\u2500\u2500\u2500 Turn ${this.turnCount} \u2500\u2500\u2500`,
            CYAN,
          ),
        );
        break;

      case "message_start": {
        const msg = event.message;
        if (msg?.role === "user") {
          const text = msg.content?.[0]?.text ?? "";
          const preview = text.length > 200 ? text.slice(0, 197) + "..." : text;
          write(styled(`> ${preview}`, BOLD));
        }
        break;
      }

      case "message_update": {
        const ame = event.assistantMessageEvent;
        if (!ame) break;

        switch (ame.type) {
          case "thinking_start":
            this.ensureNewline();
            this.inThinking = true;
            write(styled("[thinking]", GRAY));
            this.needsNewline = true;
            break;

          case "thinking_delta":
            writeInline(formatThinkingLine(ame.delta ?? ""));
            this.needsNewline = true;
            break;

          case "thinking_end":
            this.ensureNewline();
            this.inThinking = false;
            break;

          case "text_start":
            this.ensureNewline();
            this.needsNewline = true;
            break;

          case "text_delta":
            writeInline(ame.delta ?? "");
            this.needsNewline = true;
            break;

          case "text_end":
            this.ensureNewline();
            break;

          case "toolcall_start":
            this.ensureNewline();
            break;

          case "toolcall_end": {
            const tc = ame.toolCall;
            if (tc) {
              const header = toolHeader(tc.name);
              const detail = formatToolArgs(tc.name, tc.arguments);
              write(`  ${header}` + (detail ? ` ${styled(detail, DIM)}` : ""));
            }
            break;
          }
        }
        break;
      }

      case "tool_execution_start": {
        // Already displayed at toolcall_end, skip duplicate
        break;
      }

      case "tool_execution_end": {
        const text = formatToolResult(
          event.toolName,
          event.result,
          event.isError,
        );
        if (text) {
          const statusColor = event.isError ? RED : GREEN;
          const statusIcon = event.isError ? "\u2718" : "\u2714";
          const indent = "    ";
          const indented = text
            .split("\n")
            .map((line: string) => indent + styled(line, DIM))
            .join("\n");
          write(`  ${styled(statusIcon, statusColor)} ${indented.trimStart()}`);
        } else if (event.isError) {
          write(`  ${styled("\u2718 (error, no output)", RED)}`);
        }
        break;
      }

      case "message_end": {
        const msg = event.message;
        if (msg?.role === "assistant") {
          this.currentStopReason = msg.stopReason ?? "";
          const texts = (msg.content ?? []).filter(
            (c: { type: string; text?: string }) => c.type === "text" && c.text,
          );
          if (texts.length > 0) {
            const text = texts.map((c: { text: string }) => c.text).join("\n");
            if (this.currentStopReason === "stop") {
              this.finalReply = text;
            }
          }
        }
        break;
      }

      case "turn_end":
        this.ensureNewline();
        break;

      default:
        if (event.type) {
          write(styled(`[${event.type}]`, GRAY));
        }
        break;
    }
  }

  /** Call when the stream ends to flush any trailing newline. */
  flush() {
    this.ensureNewline();
  }
}
