import React from "react";
import { colors } from "@sandclaw/ui";

export function PromptsPanel() {
  return (
    <div
      style={{
        display: "flex",
        height: "100%",
        overflow: "hidden",
      }}
    >
      {/* File list sidebar */}
      <div
        id="prompts-file-list"
        style={{
          width: "200px",
          flexShrink: 0,
          borderRight: `1px solid ${colors.border}`,
          display: "flex",
          flexDirection: "column",
          background: colors.surface,
        }}
      >
        <div
          style={{
            padding: "1rem 1rem 0.75rem",
            borderBottom: `1px solid ${colors.border}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <h3 style={{ margin: 0, fontSize: "0.9rem", fontWeight: 600 }}>
            Prompts
          </h3>
          <button
            id="prompts-new-btn"
            style={{
              background: "none",
              border: "none",
              color: colors.accent,
              cursor: "pointer",
              fontSize: "1.1rem",
              padding: "0 0.25rem",
              lineHeight: 1,
            }}
            title="New file"
          >
            +
          </button>
        </div>
        <div
          id="prompts-files"
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "0.5rem 0",
          }}
        >
          <div
            style={{
              padding: "0.5rem 1rem",
              color: colors.muted,
              fontSize: "0.82rem",
            }}
          >
            Loading&hellip;
          </div>
        </div>
      </div>

      {/* Editor area */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Editor toolbar */}
        <div
          id="prompts-toolbar"
          style={{
            padding: "0.5rem 1rem",
            borderBottom: `1px solid ${colors.border}`,
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
            background: colors.surface,
            minHeight: "44px",
          }}
        >
          <span
            id="prompts-filename"
            style={{
              fontFamily: "monospace",
              fontSize: "0.85rem",
              color: colors.muted,
            }}
          >
            Select a file
          </span>
          <span id="prompts-dirty" style={{ display: "none", color: colors.warning, fontSize: "0.75rem" }}>
            (unsaved)
          </span>
          <div style={{ flex: 1 }} />
          <button
            id="prompts-save-btn"
            style={{
              padding: "0.35rem 0.9rem",
              borderRadius: "0.375rem",
              border: "none",
              background: colors.accent,
              color: "oklch(1 0 0)",
              fontWeight: 600,
              fontSize: "0.8rem",
              cursor: "pointer",
              display: "none",
            }}
          >
            Save
          </button>
          <span
            id="prompts-status"
            style={{
              fontSize: "0.75rem",
              color: colors.success,
              display: "none",
            }}
          />
        </div>

        {/* CodeMirror mount point */}
        <div
          id="prompts-editor"
          style={{
            flex: 1,
            overflow: "hidden",
          }}
        />
      </div>

      <script
        dangerouslySetInnerHTML={{
          __html: `
(function() {
  var fileListEl = document.getElementById('prompts-files');
  var filenameEl = document.getElementById('prompts-filename');
  var dirtyEl = document.getElementById('prompts-dirty');
  var saveBtn = document.getElementById('prompts-save-btn');
  var statusEl = document.getElementById('prompts-status');
  var editorEl = document.getElementById('prompts-editor');
  var newBtn = document.getElementById('prompts-new-btn');

  var currentFile = null;
  var savedContent = '';
  var editorView = null;
  var editorReady = false;

  // Load CodeMirror from esm.sh
  var importMap = document.createElement('script');
  importMap.type = 'importmap';
  importMap.textContent = JSON.stringify({
    imports: {
      "codemirror": "https://esm.sh/codemirror@6.0.1",
      "@codemirror/lang-markdown": "https://esm.sh/@codemirror/lang-markdown@6.3.1",
      "@codemirror/language-data": "https://esm.sh/@codemirror/language-data@6.5.1",
      "@codemirror/theme-one-dark": "https://esm.sh/@codemirror/theme-one-dark@6.1.2",
      "@codemirror/state": "https://esm.sh/@codemirror/state@6.5.2",
      "@codemirror/view": "https://esm.sh/@codemirror/view@6.36.5"
    }
  });
  document.head.appendChild(importMap);

  var initScript = document.createElement('script');
  initScript.type = 'module';
  initScript.textContent = \`
    import {EditorView, basicSetup} from "codemirror";
    import {markdown} from "@codemirror/lang-markdown";
    import {languages} from "@codemirror/language-data";
    import {oneDark} from "@codemirror/theme-one-dark";
    import {EditorState} from "@codemirror/state";

    var el = document.getElementById('prompts-editor');

    var customTheme = EditorView.theme({
      "&": {
        height: "100%",
        fontSize: "0.9rem",
      },
      ".cm-scroller": {
        overflow: "auto",
        fontFamily: "'SF Mono', 'Fira Code', 'JetBrains Mono', 'Cascadia Code', Menlo, Monaco, Consolas, monospace",
      },
      ".cm-content": {
        padding: "0.75rem 0",
      },
      ".cm-gutters": {
        background: "${colors.surface}",
        border: "none",
        color: "${colors.muted}",
      },
      ".cm-activeLineGutter": {
        background: "${colors.surfaceHover}",
      },
    });

    var updateListener = EditorView.updateListener.of(function(update) {
      if (update.docChanged && window.__promptsOnChange) {
        window.__promptsOnChange(update.state.doc.toString());
      }
    });

    var state = EditorState.create({
      doc: "",
      extensions: [
        basicSetup,
        markdown({ codeLanguages: languages }),
        oneDark,
        customTheme,
        updateListener,
        EditorView.lineWrapping,
        EditorState.readOnly.of(true),
      ]
    });

    var view = new EditorView({
      state: state,
      parent: el,
    });

    window.__promptsEditor = view;
    window.__promptsEditorState = EditorState;
    window.__promptsEditorExtensions = [
      basicSetup,
      markdown({ codeLanguages: languages }),
      oneDark,
      customTheme,
      updateListener,
      EditorView.lineWrapping,
    ];

    // Signal ready
    if (window.__promptsOnReady) window.__promptsOnReady();
  \`;
  document.body.appendChild(initScript);

  window.__promptsOnChange = function(content) {
    var dirty = content !== savedContent;
    dirtyEl.style.display = dirty ? 'inline' : 'none';
  };

  window.__promptsOnReady = function() {
    editorReady = true;
    loadFileList();
  };

  function setEditorContent(content, readOnly) {
    var view = window.__promptsEditor;
    var State = window.__promptsEditorState;
    var exts = window.__promptsEditorExtensions;
    if (!view || !State) return;

    var extensions = exts.slice();
    if (readOnly) extensions.push(State.readOnly.of(true));

    view.setState(State.create({
      doc: content,
      extensions: extensions,
    }));
  }

  function getEditorContent() {
    var view = window.__promptsEditor;
    if (!view) return '';
    return view.state.doc.toString();
  }

  function loadFileList() {
    fetch('/api/prompts/files')
      .then(function(r) { return r.json(); })
      .then(function(data) {
        renderFileList(data.files || []);
      })
      .catch(function(err) {
        fileListEl.innerHTML = '<div style="padding:0.5rem 1rem;color:${colors.danger};font-size:0.82rem;">Error loading files</div>';
      });
  }

  function renderFileList(files) {
    fileListEl.innerHTML = '';
    if (files.length === 0) {
      var emptyEl = document.createElement('div');
      emptyEl.style.cssText = 'padding:0.5rem 1rem;color:${colors.muted};font-size:0.82rem;';
      emptyEl.textContent = 'No prompt files yet';
      fileListEl.appendChild(emptyEl);
      return;
    }
    files.forEach(function(file) {
      var item = document.createElement('a');
      item.href = '#';
      item.textContent = file;
      item.dataset.path = file;
      item.style.cssText = 'display:block;padding:0.4rem 1rem;color:${colors.muted};text-decoration:none;font-size:0.82rem;font-family:monospace;transition:background 0.1s;';
      item.addEventListener('mouseenter', function() {
        if (currentFile !== file) item.style.background = '${colors.surfaceHover}';
      });
      item.addEventListener('mouseleave', function() {
        if (currentFile !== file) item.style.background = 'transparent';
      });
      item.addEventListener('click', function(e) {
        e.preventDefault();
        openFile(file);
      });
      fileListEl.appendChild(item);
    });
    highlightActiveFile();
  }

  function highlightActiveFile() {
    var items = fileListEl.querySelectorAll('a');
    items.forEach(function(item) {
      if (item.dataset.path === currentFile) {
        item.style.background = '${colors.surfaceHover}';
        item.style.color = '${colors.text}';
      } else {
        item.style.background = 'transparent';
        item.style.color = '${colors.muted}';
      }
    });
  }

  function openFile(filePath) {
    currentFile = filePath;
    filenameEl.textContent = filePath;
    filenameEl.style.color = '${colors.text}';
    dirtyEl.style.display = 'none';
    saveBtn.style.display = 'inline-flex';
    statusEl.style.display = 'none';
    highlightActiveFile();

    setEditorContent('Loading...', true);

    fetch('/api/prompts/file?path=' + encodeURIComponent(filePath))
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (data.error) {
          setEditorContent('Error: ' + data.error, true);
          return;
        }
        savedContent = data.content;
        setEditorContent(data.content, false);
      })
      .catch(function() {
        setEditorContent('Error loading file', true);
      });
  }

  saveBtn.addEventListener('click', function() {
    if (!currentFile) return;
    var content = getEditorContent();
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';

    fetch('/api/prompts/file', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: currentFile, content: content }),
    })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (data.error) {
          statusEl.textContent = 'Error: ' + data.error;
          statusEl.style.color = '${colors.danger}';
          statusEl.style.display = 'inline';
        } else {
          savedContent = content;
          dirtyEl.style.display = 'none';
          statusEl.textContent = 'Saved';
          statusEl.style.color = '${colors.success}';
          statusEl.style.display = 'inline';
          setTimeout(function() { statusEl.style.display = 'none'; }, 2000);
        }
      })
      .catch(function() {
        statusEl.textContent = 'Save failed';
        statusEl.style.color = '${colors.danger}';
        statusEl.style.display = 'inline';
      })
      .finally(function() {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save';
      });
  });

  // Ctrl/Cmd+S to save
  document.addEventListener('keydown', function(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      if (currentFile) {
        e.preventDefault();
        saveBtn.click();
      }
    }
  });

  newBtn.addEventListener('click', function() {
    var name = prompt('New prompt file name (e.g. CONTEXT.md):');
    if (!name) return;
    if (!name.endsWith('.md')) name += '.md';

    fetch('/api/prompts/file', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: name, content: '' }),
    })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (data.error) {
          alert('Error: ' + data.error);
          return;
        }
        loadFileList();
        setTimeout(function() { openFile(name); }, 300);
      })
      .catch(function() {
        alert('Failed to create file');
      });
  });

  // Initial load if editor not ready yet
  if (!editorReady) {
    window.__promptsOnReady = function() {
      editorReady = true;
      loadFileList();
    };
  }
})();
`,
        }}
      />
    </div>
  );
}
