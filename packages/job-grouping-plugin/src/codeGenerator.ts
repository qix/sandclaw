/**
 * Generate JavaScript grouping rule code from an English prompt.
 * Uses the Anthropic API to convert natural language to a matching function.
 */
export async function generateRuleCode(
  prompt: string,
  apiKey: string,
): Promise<{ description: string; code: string }> {
  const systemPrompt = `You are a code generator that converts English descriptions of job grouping rules into JavaScript functions.

The function receives a job object with this shape:
{
  executor: "muteworker" | "confidante",
  jobType: string,        // e.g. "email:email_received", "whatsapp:incoming_message"
  data: object,           // parsed job payload (e.g. { from, to, subject, text, ... })
  context: object | null  // optional context (e.g. { channel: "email", from: "user@example.com" })
}

The function must return either:
- null (if the job does NOT match this rule)
- { group: "<string key>", windowMs: <number> } if the job matches

The "group" string is used to group matching jobs together. Jobs with the same group key in the same time window are batched.
The "windowMs" is the grouping window in milliseconds (e.g. 3600000 for 1 hour).

IMPORTANT: Output ONLY the function body as a JavaScript function expression, nothing else. No markdown, no explanation.
The function signature is: function(job) { ... }
Output just the function body starting with { and ending with }.`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: `Convert this rule to a JavaScript function:\n\n${prompt}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Anthropic API error: ${response.status} ${errorText}`);
  }

  const data = (await response.json()) as {
    content: Array<{ type: string; text: string }>;
  };
  const text = data.content
    .filter((c) => c.type === "text")
    .map((c) => c.text)
    .join("");

  // Extract the function body - strip markdown fences if present
  let code = text.trim();
  if (code.startsWith("```")) {
    code = code.replace(/^```(?:javascript|js)?\n?/, "").replace(/\n?```$/, "");
  }

  return {
    description: prompt,
    code: code.trim(),
  };
}

/**
 * Build the full rules file content from all rules in the database.
 * Format: module.exports = [{ description, code() { ... } }, ...]
 */
export function buildRulesFileContent(
  rules: Array<{ prompt: string; generated_code: string }>,
): string {
  const entries = rules.map((rule) => {
    const escapedDesc = rule.prompt.replace(/\\/g, "\\\\").replace(/`/g, "\\`");
    return `  {
    description: \`${escapedDesc}\`,
    code(job) ${rule.generated_code}
  }`;
  });

  return `// Auto-generated job grouping rules — do not edit manually.
// Generated from English prompts via the Job Grouping plugin.

module.exports = [
${entries.join(",\n\n")}
];
`;
}
