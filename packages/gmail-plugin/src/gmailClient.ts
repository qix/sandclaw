export interface GmailPluginConfig {
  /** Google OAuth2 client ID. */
  clientId: string;
  /** Google OAuth2 client secret. */
  clientSecret: string;
  /** OAuth2 refresh token. */
  refreshToken: string;
  /** User's email address (the "from" for outbound). */
  userEmail: string;
  /** Polling interval for new messages in ms. Defaults to 30000. */
  pollIntervalMs?: number;
}

export async function createGmailClient(config: GmailPluginConfig) {
  // Dynamic import to avoid hard failures if googleapis isn't installed
  const { google } = await import("googleapis");
  const oauth2Client = new google.auth.OAuth2(
    config.clientId,
    config.clientSecret,
  );
  oauth2Client.setCredentials({ refresh_token: config.refreshToken });
  return google.gmail({ version: "v1", auth: oauth2Client });
}

export async function sendEmail(
  config: GmailPluginConfig,
  to: string,
  subject: string,
  text: string,
): Promise<{ messageId: string }> {
  const gmail = await createGmailClient(config);

  const messageParts = [
    `From: ${config.userEmail}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    "Content-Type: text/plain; charset=utf-8",
    "",
    text,
  ];
  const raw = Buffer.from(messageParts.join("\r\n")).toString("base64url");

  const result = await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw },
  });

  return { messageId: result.data.id ?? "" };
}
