export { computeDiff } from "./diff";
export type { DiffLine, DiffPreview } from "./diff";

export { resolveSecurePath, tryReadFile } from "./pathUtils";

export { registerFileEditRoute, registerFileWriteRoute } from "./fileRoutes";
export type { FileRouteConfig } from "./fileRoutes";

export { createFileEditTool, createFileWriteTool } from "./fileTools";
export type { FileToolConfig } from "./fileTools";

export { createFileVerificationCallback } from "./fileVerification";
export type { FileVerificationConfig } from "./fileVerification";

export { registerFileEditorRoutes, listDir } from "./fileEditorRoutes";
export type { FileEditorRoutesOptions } from "./fileEditorRoutes";

export { generateFileEditorScript } from "./fileEditorScript";
export type { FileEditorConfig } from "./fileEditorScript";
