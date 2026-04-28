import {
  registerFileEditorRoutes,
  registerFileEditRoute,
} from "@sandclaw/gatekeeper-util";

export function registerRoutes(app: any, memoryDir: string) {
  registerFileEditorRoutes(app, {
    prefix: "memory",
    dir: memoryDir,
    apiBase: "/api/memory",
    newFilePrompt: "New memory file name (e.g. notes.md):",
    emptyMessage: "No memory files yet",
    dirLabel: "memory",
  });

  // Immediate edit route (no verification)
  registerFileEditRoute(app, { rootDir: memoryDir });
}
