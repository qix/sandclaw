export interface WrapOptions {
  horizontalCenter?: boolean;
  verticalCenter?: boolean;
}

export interface WrapResult {
  result: string;
  complete: boolean;
}

export function attemptWrap(
  text: string,
  width: number,
  height: number,
  options: WrapOptions = {},
): WrapResult {
  const lines: string[] = [];

  for (const paragraph of text.split("\n")) {
    if (paragraph.length === 0) {
      lines.push("");
      continue;
    }
    const words = paragraph.split(/[ \t]+/).filter((w) => w.length > 0);
    let current = "";
    for (const word of words) {
      if (word.length > width) {
        if (current) {
          lines.push(current);
          current = "";
        }
        let remaining = word;
        while (remaining.length > width) {
          lines.push(remaining.slice(0, width));
          remaining = remaining.slice(width);
        }
        current = remaining;
      } else if (!current) {
        current = word;
      } else if (current.length + 1 + word.length <= width) {
        current = current + " " + word;
      } else {
        lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
  }

  const complete = lines.length <= height;
  let outputLines = lines.slice(0, height);

  if (options.horizontalCenter) {
    outputLines = outputLines.map((line) => {
      const pad = Math.max(0, Math.floor((width - line.length) / 2));
      return " ".repeat(pad) + line;
    });
  }

  if (options.verticalCenter && outputLines.length < height) {
    const pad = Math.floor((height - outputLines.length) / 2);
    outputLines = [...Array(pad).fill(""), ...outputLines];
  }

  return { result: outputLines.join("\n"), complete };
}
