import { homedir } from "node:os";
import path from "node:path";

export function resolveVaultRoot(vaultRoot: string): string {
  const expanded = vaultRoot.startsWith("~")
    ? path.join(homedir(), vaultRoot.slice(1))
    : vaultRoot;
  return path.resolve(expanded);
}
