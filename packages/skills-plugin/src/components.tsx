import React from "react";
import { FileEditorPanel } from "@sandclaw/ui";

export function SkillsPanel() {
  return (
    <FileEditorPanel
      prefix="skills"
      title="Skills"
      apiBase="/api/skills"
    />
  );
}
