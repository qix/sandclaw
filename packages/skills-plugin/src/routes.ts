import { registerFileEditorRoutes } from "@sandclaw/gatekeeper-util";

export function registerRoutes(app: any, skillsDir: string) {
  registerFileEditorRoutes(app, {
    prefix: "skills",
    dir: skillsDir,
    apiBase: "/api/skills",
    newFilePrompt: "New skill file name (e.g. MY_SKILL.md):",
    emptyMessage: "No skill files yet",
    dirLabel: "skills",
  });
}
