import React from "react";
import { FileEditorPanel } from "@sandclaw/ui";

export function MemoryPanel() {
  return (
    <FileEditorPanel
      prefix="memory"
      title="Memory"
      apiBase="/api/memory"
    />
  );
}
