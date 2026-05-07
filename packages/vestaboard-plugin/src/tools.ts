import { TSchema } from "@mariozechner/pi-ai";
import type { MuteworkerPluginContext } from "@sandclaw/muteworker-plugin-api";

export function createVestaboardWriteTool(ctx: MuteworkerPluginContext) {
  return {
    name: "vestaboard_set_message",
    label: "Vestaboard Set Message",
    description:
      "Display a message on the Vestaboard (22 columns x 6 rows). " +
      "Letters are rendered lowercase. Supported characters: a-z, 0-9, space, and ! @ # $ ( ) - + & = ; : ' \" % , . / ? °. " +
      "You can also paint solid color squares by including these uppercase letters as cells: " +
      "R=Red, O=Orange, Y=Yellow, G=Green, B=Blue, W=White, L=Black. " +
      "Each color letter is rendered as a single 1-cell colored square (e.g. \"RRRRR hello RRRRR\" puts 5 red squares on each side of \"hello\"). " +
      "Any other uppercase letter is rejected — use lowercase for text. " +
      "Throws if the message contains unsupported characters or is too long to fit.",
    parameters: {
      type: "object",
      properties: {
        message: {
          type: "string",
          description:
            "The message to display. Use lowercase letters for text. Uppercase R/O/Y/G/B/W/L render as colored squares (Red/Orange/Yellow/Green/Blue/White/bLack); any other uppercase letter is rejected. Word-wrapped to fit 22x6, centered horizontally and vertically.",
        },
      },
      required: ["message"],
      additionalProperties: false,
    } as unknown as TSchema,
    execute: async (_toolCallId: string, params: any) => {
      const message =
        typeof params.message === "string" ? params.message : "";
      if (!message.trim()) throw new Error("message cannot be empty");

      let response: Response;
      try {
        response = await fetch(
          `${ctx.gatekeeperInternalUrl}/api/vestaboard/send`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message }),
          },
        );
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        throw new Error(`Failed to reach gatekeeper: ${detail}`);
      }

      const data = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        message?: string;
        wrapped?: string;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(
          data.error ?? `Gatekeeper returned ${response.status}`,
        );
      }

      const wrapped = data.wrapped ?? message;

      ctx.artifacts.push({
        type: "text",
        label: "Vestaboard",
        value: wrapped,
      });

      return {
        content: [{ type: "text", text: `Vestaboard updated:\n${wrapped}` }],
        details: { message: data.message ?? message, wrapped },
      };
    },
  };
}
