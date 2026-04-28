import React from "react";
import { FileEditorPanel } from "@sandclaw/ui";

export function PromptsPanel() {
  return (
    <FileEditorPanel
      prefix="prompts"
      title="Prompts"
      apiBase="/api/prompts"
    />
  );
}
