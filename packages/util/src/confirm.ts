export function confirm(question: string): Promise<boolean> {
  // When stdin is not a TTY (e.g. piped input), read a line without raw mode.
  // Write the prompt to stderr so it's visible even when stdout is piped.
  if (!process.stdin.isTTY) {
    return new Promise((resolve) => {
      process.stderr.write(`${question} [y/N] `);
      let input = "";
      process.stdin.resume();
      process.stdin.setEncoding("utf8");
      process.stdin.on("data", function onData(chunk: string) {
        input += chunk;
        if (input.includes("\n")) {
          process.stdin.removeListener("data", onData);
          process.stdin.pause();
          const answer = input.trim().toLowerCase();
          process.stderr.write(answer === "y" ? "y\n" : "n\n");
          resolve(answer === "y");
        }
      });
      process.stdin.on("end", function onEnd() {
        process.stdin.removeListener("end", onEnd);
        process.stdin.pause();
        // No input received — treat as "no"
        process.stderr.write("n\n");
        resolve(false);
      });
    });
  }

  return new Promise((resolve) => {
    process.stderr.write(`${question} [y/N] `);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.once("data", (data) => {
      const key = data.toString().toLowerCase();
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stderr.write(key === "y" ? "y\n" : "n\n");
      resolve(key === "y");
    });
  });
}
