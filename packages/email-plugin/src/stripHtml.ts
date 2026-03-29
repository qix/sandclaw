/**
 * Strip HTML from email body text, extracting only meaningful content.
 *
 * Handles raw HTML emails by removing tags, style/script blocks,
 * tracking pixels, and excessive whitespace to produce clean plain text.
 */
export function stripHtml(text: string): string {
  if (!text) return text;

  // If it doesn't look like HTML, return as-is (with whitespace cleanup)
  if (!/<[a-zA-Z][\s\S]*?>/.test(text)) {
    return collapseWhitespace(text);
  }

  let result = text;

  // Remove style blocks
  result = result.replace(/<style[\s\S]*?<\/style\s*>/gi, "");

  // Remove script blocks
  result = result.replace(/<script[\s\S]*?<\/script\s*>/gi, "");

  // Remove HTML comments (including conditional comments)
  result = result.replace(/<!--[\s\S]*?-->/g, "");

  // Remove tracking pixels and hidden images (1x1, display:none, etc.)
  result = result.replace(
    /<img[^>]*(?:width\s*=\s*["']?1["']?|height\s*=\s*["']?1["']?|display\s*:\s*none)[^>]*\/?>/gi,
    "",
  );

  // Remove hidden elements (display:none, visibility:hidden)
  result = result.replace(
    /<[^>]+style\s*=\s*["'][^"']*(?:display\s*:\s*none|visibility\s*:\s*hidden)[^"']*["'][^>]*>[\s\S]*?<\/[^>]+>/gi,
    "",
  );

  // Convert block-level elements to newlines before stripping tags
  result = result.replace(
    /<\/(?:p|div|tr|li|h[1-6]|blockquote|section|article|header|footer)>/gi,
    "\n",
  );
  result = result.replace(/<(?:br|hr)\s*\/?>/gi, "\n");
  result = result.replace(/<li[^>]*>/gi, "- ");

  // Strip all remaining HTML tags
  result = result.replace(/<[^>]+>/g, "");

  // Decode common HTML entities
  result = decodeEntities(result);

  return collapseWhitespace(result);
}

function decodeEntities(text: string): string {
  const entities: Record<string, string> = {
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": '"',
    "&#39;": "'",
    "&apos;": "'",
    "&nbsp;": " ",
    "&ndash;": "\u2013",
    "&mdash;": "\u2014",
    "&laquo;": "\u00AB",
    "&raquo;": "\u00BB",
    "&bull;": "\u2022",
    "&hellip;": "\u2026",
    "&copy;": "\u00A9",
    "&reg;": "\u00AE",
    "&trade;": "\u2122",
  };

  let result = text;
  for (const [entity, char] of Object.entries(entities)) {
    result = result.replaceAll(entity, char);
  }
  // Decode numeric entities (&#123; and &#x1A;)
  result = result.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) =>
    String.fromCharCode(parseInt(hex, 16)),
  );
  result = result.replace(/&#(\d+);/g, (_, dec) =>
    String.fromCharCode(parseInt(dec, 10)),
  );
  return result;
}

function collapseWhitespace(text: string): string {
  return (
    text
      // Collapse runs of spaces/tabs on each line (preserve newlines)
      .replace(/[^\S\n]+/g, " ")
      // Collapse 3+ consecutive newlines into 2
      .replace(/\n{3,}/g, "\n\n")
      // Trim each line
      .split("\n")
      .map((line) => line.trim())
      .join("\n")
      .trim()
  );
}
