// --- Muted stderr helpers ---

const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

function muted(text: string) {
  process.stderr.write(`${DIM}${text}${RESET}\n`);
}

function mutedInline(text: string) {
  process.stderr.write(`${DIM}${text}${RESET}`);
}

/**
 * Tracks streaming pi events, pretty-prints them to stderr,
 * and captures the final assistant reply.
 */
export class PiEventPrinter {
  private needsNewline = false;
  private currentStopReason = "";
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
        muted(`[session] ${event.id} (v${event.version}) cwd=${event.cwd}`);
        break;

      case "agent_start":
        muted("[agent] started");
        break;

      case "turn_start":
        this.ensureNewline();
        muted("\n--- turn ---");
        break;

      case "message_start": {
        const msg = event.message;
        if (msg?.role === "user") {
          const text = msg.content?.[0]?.text ?? "";
          muted(`[user] ${text}`);
        }
        break;
      }

      case "message_update": {
        const ame = event.assistantMessageEvent;
        if (!ame) break;

        switch (ame.type) {
          case "thinking_start":
            this.ensureNewline();
            muted("[thinking]");
            this.needsNewline = true;
            break;

          case "thinking_delta":
            mutedInline(ame.delta ?? "");
            this.needsNewline = true;
            break;

          case "thinking_end":
            this.ensureNewline();
            break;

          case "text_start":
            this.ensureNewline();
            this.needsNewline = true;
            break;

          case "text_delta":
            mutedInline(ame.delta ?? "");
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
              muted(
                `[tool-call] ${tc.name}(${JSON.stringify(tc.arguments)})`,
              );
            }
            break;
          }
        }
        break;
      }

      case "tool_execution_start":
        this.ensureNewline();
        muted(
          `[executing] ${event.toolName}(${JSON.stringify(event.args)})`,
        );
        break;

      case "tool_execution_end": {
        const text = event.result?.content?.[0]?.text ?? "";
        const preview = text.slice(0, 200).replace(/\n/g, " ");
        const prefix = event.isError ? "[tool-error]" : "[tool-result]";
        muted(
          `${prefix} ${event.toolName}: ${preview}${text.length > 200 ? "..." : ""}`,
        );
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
            const text = texts
              .map((c: { text: string }) => c.text)
              .join("\n");
            // Only treat as final reply when the model stopped naturally
            // (not when it stopped to make a tool call)
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
          muted(`[${event.type}]`);
        }
        break;
    }
  }

  /** Call when the stream ends to flush any trailing newline. */
  flush() {
    this.ensureNewline();
  }
}
