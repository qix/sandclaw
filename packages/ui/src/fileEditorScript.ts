import { colors } from "./theme";

export interface FileEditorConfig {
  /** Element ID prefix, e.g. "prompts" or "skills" */
  prefix: string;
  /** API base path, e.g. "/api/prompts" */
  apiBase: string;
  /** Dialog text for the new-file prompt */
  newFilePrompt: string;
  /** Text shown when no files exist */
  emptyMessage: string;
}

/**
 * Generates the client-side JavaScript for the file-editor panel.
 * Returned as a plain string — served via a `<script src>` route.
 *
 * Uses dynamic import() with esm.sh's ?deps= parameter to guarantee
 * a single @codemirror/state instance across all packages (avoids the
 * "Unrecognized extension value" error from duplicate instances).
 */
export function generateFileEditorScript(config: FileEditorConfig): string {
  const { prefix, apiBase, newFilePrompt, emptyMessage } = config;
  const P = prefix;

  return `
(function() {
  var fileListEl = document.getElementById('${P}-files');
  var filenameEl = document.getElementById('${P}-filename');
  var dirtyEl = document.getElementById('${P}-dirty');
  var saveBtn = document.getElementById('${P}-save-btn');
  var statusEl = document.getElementById('${P}-status');
  var editorEl = document.getElementById('${P}-editor');
  var newBtn = document.getElementById('${P}-new-btn');

  var currentFile = null;
  var savedContent = '';
  var isDirty = false;
  var cmEditor = null;
  var cmState = null;
  var cmExtensions = null;

  function setDirty(dirty) {
    isDirty = dirty;
    dirtyEl.style.display = dirty ? 'inline' : 'none';
  }

  function confirmDiscardIfDirty() {
    if (!isDirty) return true;
    return window.confirm('You have unsaved changes that will be lost. Discard them?');
  }

  // ── Load file list FIRST — no CodeMirror dependency ──
  try { loadFileList(); } catch(e) { console.error('loadFileList failed:', e); }

  // ── Load CodeMirror via dynamic imports ──
  // Pin only @codemirror/state to deduplicate instances (the root cause of
  // "Unrecognized extension value" errors). Let esm.sh resolve @codemirror/view
  // and other transitive deps naturally to avoid export mismatches.
  var cmDeps = '?deps=@codemirror/state@6.5.2';
  Promise.all([
    import('https://esm.sh/codemirror@6.0.1' + cmDeps),
    import('https://esm.sh/@codemirror/lang-markdown@6.3.1' + cmDeps),
    import('https://esm.sh/@codemirror/language-data@6.5.1' + cmDeps),
    import('https://esm.sh/@codemirror/theme-one-dark@6.1.2' + cmDeps),
    import('https://esm.sh/@codemirror/state@6.5.2'),
  ]).then(function(mods) {
    var EditorView = mods[0].EditorView;
    var basicSetup = mods[0].basicSetup;
    var markdown = mods[1].markdown;
    var languages = mods[2].languages;
    var oneDark = mods[3].oneDark;
    var EditorState = mods[4].EditorState;

    var customTheme = EditorView.theme({
      '&': { height: '100%', fontSize: '0.9rem' },
      '.cm-scroller': {
        overflow: 'auto',
        fontFamily: "'SF Mono', 'Fira Code', 'JetBrains Mono', 'Cascadia Code', Menlo, Monaco, Consolas, monospace"
      },
      '.cm-content': { padding: '0.75rem 0' },
      '.cm-gutters': { background: '${colors.surface}', border: 'none', color: '${colors.muted}' },
      '.cm-activeLineGutter': { background: '${colors.surfaceHover}' }
    });

    var updateListener = EditorView.updateListener.of(function(update) {
      if (update.docChanged) {
        setDirty(update.state.doc.toString() !== savedContent);
      }
    });

    var extensions = [
      basicSetup,
      markdown({ codeLanguages: languages }),
      oneDark,
      customTheme,
      updateListener,
      EditorView.lineWrapping,
    ];

    var state = EditorState.create({
      doc: '',
      extensions: extensions.concat([EditorState.readOnly.of(true)])
    });

    var view = new EditorView({ state: state, parent: editorEl });

    cmEditor = view;
    cmState = EditorState;
    cmExtensions = extensions;
  }).catch(function(err) {
    console.error('CodeMirror load failed:', err);
  });

  function setEditorContent(content, readOnly) {
    if (!cmEditor || !cmState) return;
    var exts = cmExtensions.slice();
    if (readOnly) exts.push(cmState.readOnly.of(true));
    cmEditor.setState(cmState.create({ doc: content, extensions: exts }));
  }

  function getEditorContent() {
    if (!cmEditor) return '';
    return cmEditor.state.doc.toString();
  }

  function loadFileList() {
    fetch('${apiBase}/files')
      .then(function(r) { return r.json(); })
      .then(function(data) {
        renderFileList(data.files || []);
      })
      .catch(function(err) {
        console.error('Error loading file list:', err);
        fileListEl.innerHTML = '<div style="padding:0.5rem 1rem;color:${colors.danger};font-size:0.82rem;">Error loading files</div>';
      });
  }

  function renderFileList(files) {
    fileListEl.innerHTML = '';
    if (files.length === 0) {
      var emptyEl = document.createElement('div');
      emptyEl.style.cssText = 'padding:0.5rem 1rem;color:${colors.muted};font-size:0.82rem;';
      emptyEl.textContent = '${emptyMessage}';
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
        if (file === currentFile) return;
        if (!confirmDiscardIfDirty()) return;
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
    setDirty(false);
    saveBtn.style.display = 'inline-flex';
    statusEl.style.display = 'none';
    highlightActiveFile();

    setEditorContent('Loading...', true);

    fetch('${apiBase}/file?path=' + encodeURIComponent(filePath))
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

    fetch('${apiBase}/file', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: currentFile, content: content })
    })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (data.error) {
          statusEl.textContent = 'Error: ' + data.error;
          statusEl.style.color = '${colors.danger}';
          statusEl.style.display = 'inline';
        } else {
          savedContent = content;
          setDirty(false);
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

  // Warn before closing/navigating away with unsaved changes
  window.addEventListener('beforeunload', function(e) {
    if (!isDirty) return;
    e.preventDefault();
    e.returnValue = '';
    return '';
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
    if (!confirmDiscardIfDirty()) return;
    var name = prompt('${newFilePrompt}');
    if (!name) return;
    if (!name.endsWith('.md')) name += '.md';

    fetch('${apiBase}/file', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: name, content: '' })
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

})();
`;
}
