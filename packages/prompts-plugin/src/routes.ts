import {
  registerFileEditorRoutes,
  registerFileEditRoute,
  registerFileWriteRoute,
} from "@sandclaw/gatekeeper-util";

export function registerRoutes(app: any, promptsDir: string, db?: any) {
  registerFileEditorRoutes(app, {
    prefix: "prompts",
    dir: promptsDir,
    apiBase: "/api/prompts",
    newFilePrompt: "New prompt file name (e.g. CONTEXT.md):",
    emptyMessage: "No prompt files yet",
    dirLabel: "prompts",
  });

  // Verified edit/write routes (require db)
  if (db) {
    registerFileEditRoute(app, {
      plugin: "prompts",
      rootDir: promptsDir,
      db,
    });
    registerFileWriteRoute(app, {
      plugin: "prompts",
      rootDir: promptsDir,
      db,
    });
  }
}
