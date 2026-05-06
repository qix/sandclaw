import { TSchema } from "@mariozechner/pi-ai";
import type { MuteworkerPluginContext } from "@sandclaw/muteworker-plugin-api";
import { UnsupportedChar, Vestaboard } from "./vestaboard";
import { attemptWrap } from "./wrap";

export interface VestaboardConfig {
  /** Webhook URL that accepts the rendered display payload (same env as VESTABOARD_POST_WEBHOOK_URL). */
  webhookUrl: string;
}

export function createVestaboardWriteTool(
  ctx: MuteworkerPluginContext,
  config: VestaboardConfig,
) {
  return {
    name: "vestaboard_set_message",
    label: "Vestaboard Set Message",
    description:
      "Display a message on the Vestaboard (22 columns x 6 rows). Letters are rendered lowercase. Supported characters: a-z, 0-9, space, and ! @ # $ ( ) - + & = ; : ' \" % , . / ? °. Throws if the message contains unsupported characters or is too long to fit.",
    parameters: {
      type: "object",
      properties: {
        message: {
          type: "string",
          description:
            "The message to display. Will be lowercased and word-wrapped to fit the 22x6 board, centered horizontally and vertically.",
        },
      },
      required: ["message"],
      additionalProperties: false,
    } as unknown as TSchema,
    execute: async (_toolCallId: string, params: any) => {
      const rawMessage =
        typeof params.message === "string" ? params.message : "";
      const message = rawMessage.replace(/\t/g, " ").trim();
      if (!message) throw new Error("message cannot be empty");

      if (!config.webhookUrl) {
        throw new Error(
          "Vestaboard is not configured: webhookUrl is empty (set VESTABOARD_POST_WEBHOOK_URL).",
        );
      }

      const lowered = message.toLowerCase();

      let wrapped: string;
      try {
        const attempt = attemptWrap(
          lowered,
          Vestaboard.width,
          Vestaboard.height,
          { horizontalCenter: true, verticalCenter: true },
        );
        if (!attempt.complete) {
          throw new Error(
            `Message is too long to fit on the Vestaboard (max ${Vestaboard.width} columns x ${Vestaboard.height} rows).`,
          );
        }
        wrapped = attempt.result;
      } catch (err) {
        if (err instanceof UnsupportedChar) {
          throw new Error(
            `Message contains an unsupported character: ${JSON.stringify(err.char)}`,
          );
        }
        throw err;
      }

      const board = new Vestaboard();
      try {
        board.write(0, 0, wrapped);
      } catch (err) {
        if (err instanceof UnsupportedChar) {
          throw new Error(
            `Message contains an unsupported character: ${JSON.stringify(err.char)}`,
          );
        }
        throw err;
      }

      const response = await fetch(config.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          display: board.current,
          message: lowered,
          wrapped,
        }),
      });

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(
          `Vestaboard webhook failed with status ${response.status}: ${body.slice(0, 300)}`,
        );
      }

      ctx.artifacts.push({
        type: "text",
        label: "Vestaboard",
        value: wrapped,
      });

      return {
        content: [
          {
            type: "text",
            text: `Vestaboard updated:\n${wrapped}`,
          },
        ],
        details: { message: lowered, wrapped },
      };
    },
  };
}
