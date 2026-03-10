export const GWS_PLUGIN_ID = "google-workspace";
export const GWS_VERIFICATION_ACTION = "exec_command";
export const GWS_CONFIDANTE_JOB_TYPE = "google-workspace:exec";
export const GWS_RESULT_JOB_TYPE = "google-workspace:exec_result";

export const READ_METHODS = new Set([
  // Standard REST read methods
  "get",
  "list",
  "search",
  "query",
  "download",
  "export",
  "getStartPageToken",
  "generateIds",
  // Helper read commands
  "+read",
  "+triage",
  "+watch",
  "+standup-report",
  "+meeting-prep",
  "+weekly-digest",
  "+agenda",
  "+subscribe",
  "+renew",
  "+sanitize-prompt",
  "+sanitize-response",
]);
