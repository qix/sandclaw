import TelegramBot from "node-telegram-bot-api";

/**
 * Downloads a voice message from Telegram and transcribes it using
 * the OpenAI Whisper API (model: whisper-1).
 *
 * Requires OPENAI_API_KEY to be set in the environment or passed via
 * the plugin's `openaiApiKey` option.
 */
export async function transcribeVoiceMessage(
  bot: TelegramBot,
  fileId: string,
  openaiApiKey: string,
): Promise<string> {
  // 1. Resolve the file path on Telegram's servers
  const file = await bot.getFile(fileId);
  if (!file.file_path) {
    throw new Error("Telegram returned no file_path for voice message");
  }

  // 2. Download the voice file bytes
  const token = (bot as any).token as string;
  const fileUrl = `https://api.telegram.org/file/bot${token}/${file.file_path}`;
  const fileResponse = await fetch(fileUrl);
  if (!fileResponse.ok) {
    throw new Error(
      `Failed to download voice file: ${fileResponse.status} ${fileResponse.statusText}`,
    );
  }
  const arrayBuffer = await fileResponse.arrayBuffer();

  // Telegram voice messages are encoded as OGG/Opus
  const extension = file.file_path.split(".").pop() ?? "ogg";
  const blob = new Blob([arrayBuffer], { type: `audio/${extension}` });

  // 3. Send to OpenAI Whisper API for transcription
  const form = new FormData();
  form.append("file", blob, `voice.${extension}`);
  form.append("model", "whisper-1");

  const whisperResponse = await fetch(
    "https://api.openai.com/v1/audio/transcriptions",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${openaiApiKey}` },
      body: form,
    },
  );

  if (!whisperResponse.ok) {
    const body = await whisperResponse.text().catch(() => "");
    throw new Error(
      `Whisper transcription failed (${whisperResponse.status}): ${body.slice(0, 300)}`,
    );
  }

  const result = (await whisperResponse.json()) as { text: string };
  return result.text;
}
