export function confirm(question: string): Promise<boolean> {
  return new Promise((resolve) => {
    process.stdout.write(`${question} [y/N] `);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.once("data", (data) => {
      const key = data.toString().toLowerCase();
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write(key === "y" ? "y\n" : "n\n");
      resolve(key === "y");
    });
  });
}
