import React, { useContext } from "react";
import { colors } from "@sandclaw/ui";
import { NavigationContext } from "@sandclaw/gatekeeper-plugin-api";

/* ------------------------------------------------------------------ */
/*  Sub-navigation tabs                                                */
/* ------------------------------------------------------------------ */

const subTabStyle = (active: boolean): React.CSSProperties => ({
  padding: "0.5rem 1rem",
  fontSize: "0.82rem",
  fontWeight: 600,
  color: active ? colors.accent : colors.muted,
  borderBottom: active ? `2px solid ${colors.accent}` : "2px solid transparent",
  background: "none",
  border: "none",
  borderBottomStyle: "solid",
  borderBottomWidth: "2px",
  borderBottomColor: active ? colors.accent : "transparent",
  cursor: "pointer",
  textDecoration: "none",
});

/* ------------------------------------------------------------------ */
/*  Wrapper page — renders sub-nav + active sub-page                   */
/* ------------------------------------------------------------------ */

export function JobGroupingPage() {
  const { queryParams } = useContext(NavigationContext);
  const view = queryParams.view ?? "status";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden",
      }}
    >
      {/* Sub-navigation bar */}
      <div
        style={{
          display: "flex",
          gap: "0.25rem",
          padding: "0 1.5rem",
          borderBottom: `1px solid ${colors.border}`,
          background: colors.surface,
        }}
      >
        <a href="?page=job-grouping&view=status" style={subTabStyle(view === "status")}>
          Status
        </a>
        <a href="?page=job-grouping&view=rules" style={subTabStyle(view === "rules")}>
          Rules
        </a>
      </div>

      {/* Sub-page content */}
      <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {view === "rules" ? <JobGroupingRulesPanel /> : <JobGroupingStatusPanel />}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Status sub-page                                                    */
/* ------------------------------------------------------------------ */

export function JobGroupingStatusPanel() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "1rem 1.5rem 0.75rem",
          borderBottom: `1px solid ${colors.border}`,
          background: colors.surface,
        }}
      >
        <h2 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 600 }}>
          Grouping Status
        </h2>
        <p
          style={{
            margin: "0.25rem 0 0",
            fontSize: "0.8rem",
            color: colors.muted,
          }}
        >
          Pending grouped jobs waiting to be flushed, and grouped jobs already in
          the main queue.
        </p>
      </div>

      {/* Pending groups */}
      <div
        id="jgs-content"
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "0.75rem 1.5rem",
        }}
      >
        <div
          style={{
            color: colors.muted,
            fontSize: "0.85rem",
            textAlign: "center",
            padding: "2rem 0",
          }}
        >
          Loading&hellip;
        </div>
      </div>

      {/* Client script */}
      <script
        dangerouslySetInnerHTML={{
          __html: `
(function() {
  var contentEl = document.getElementById('jgs-content');

  function load() {
    fetch('/api/job-grouping/status')
      .then(function(r) { return r.json(); })
      .then(function(data) { render(data); })
      .catch(function(err) {
        contentEl.innerHTML = '<div style="color:${colors.danger};padding:1rem;">Error: ' + err.message + '</div>';
      });
  }

  function render(data) {
    contentEl.innerHTML = '';
    var pendingGroups = data.pendingGroups || [];
    var mainQueueGrouped = data.mainQueueGrouped || [];

    // --- Pending Groups Section ---
    var pendingHeader = document.createElement('h3');
    pendingHeader.style.cssText = 'margin:0 0 0.75rem;font-size:0.95rem;font-weight:600;color:${colors.text};';
    pendingHeader.textContent = 'Pending Groups';
    contentEl.appendChild(pendingHeader);

    if (pendingGroups.length === 0) {
      var emptyPending = document.createElement('div');
      emptyPending.style.cssText = 'color:${colors.muted};font-size:0.85rem;padding:1rem 0 1.5rem;';
      emptyPending.textContent = 'No pending groups. Jobs will appear here while waiting for their grouping window to expire.';
      contentEl.appendChild(emptyPending);
    } else {
      pendingGroups.forEach(function(group) {
        var card = document.createElement('div');
        card.style.cssText = 'margin-bottom:1rem;border:1px solid ${colors.border};border-radius:0.5rem;overflow:hidden;background:${colors.surface};';

        // Group header
        var header = document.createElement('div');
        header.style.cssText = 'padding:0.75rem 1rem;display:flex;align-items:center;gap:1rem;flex-wrap:wrap;';

        var groupLabel = document.createElement('div');
        groupLabel.style.cssText = 'flex:1;min-width:200px;';
        groupLabel.innerHTML = '<div style="font-size:0.7rem;text-transform:uppercase;letter-spacing:0.05em;color:${colors.muted};margin-bottom:0.15rem;">Group Key</div>' +
          '<div style="font-size:0.85rem;color:${colors.text};font-weight:600;">' + escapeHtml(group.groupKey) + '</div>';
        header.appendChild(groupLabel);

        var ruleLabel = document.createElement('div');
        ruleLabel.style.cssText = 'flex:1;min-width:200px;';
        ruleLabel.innerHTML = '<div style="font-size:0.7rem;text-transform:uppercase;letter-spacing:0.05em;color:${colors.muted};margin-bottom:0.15rem;">Rule</div>' +
          '<div style="font-size:0.82rem;color:${colors.text};">' + escapeHtml(group.rulePrompt) + '</div>';
        header.appendChild(ruleLabel);

        var meta = document.createElement('div');
        meta.style.cssText = 'display:flex;gap:1rem;font-size:0.75rem;color:${colors.muted};';
        meta.innerHTML = '<span>' + group.jobs.length + ' job' + (group.jobs.length !== 1 ? 's' : '') + '</span>' +
          '<span>Window: ' + escapeHtml(group.windowStart) + '</span>' +
          '<span>Executor: ' + escapeHtml(group.executor) + '</span>';
        header.appendChild(meta);

        card.appendChild(header);

        // Individual jobs in the group
        var jobsList = document.createElement('div');
        jobsList.style.cssText = 'border-top:1px solid ${colors.border};';

        group.jobs.forEach(function(job, idx) {
          var jobRow = document.createElement('div');
          jobRow.style.cssText = 'padding:0.5rem 1rem;font-size:0.8rem;display:flex;align-items:flex-start;gap:0.75rem;' +
            (idx > 0 ? 'border-top:1px solid ${colors.border};' : '');

          var jobType = document.createElement('span');
          jobType.style.cssText = 'font-weight:600;color:${colors.accent};white-space:nowrap;min-width:120px;';
          jobType.textContent = job.jobType;
          jobRow.appendChild(jobType);

          var jobData = document.createElement('span');
          jobData.style.cssText = 'color:${colors.muted};font-family:"SF Mono","Fira Code","JetBrains Mono",Menlo,monospace;font-size:0.75rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;';
          try {
            var parsed = JSON.parse(job.data);
            jobData.textContent = JSON.stringify(parsed).substring(0, 200);
          } catch(e) {
            jobData.textContent = (job.data || '').substring(0, 200);
          }
          jobRow.appendChild(jobData);

          var jobTime = document.createElement('span');
          jobTime.style.cssText = 'color:${colors.muted};font-size:0.7rem;white-space:nowrap;';
          jobTime.textContent = job.createdAt || '';
          jobRow.appendChild(jobTime);

          jobsList.appendChild(jobRow);
        });

        card.appendChild(jobsList);
        contentEl.appendChild(card);
      });
    }

    // --- Main Queue Grouped Jobs Section ---
    var queueHeader = document.createElement('h3');
    queueHeader.style.cssText = 'margin:1.5rem 0 0.75rem;font-size:0.95rem;font-weight:600;color:${colors.text};';
    queueHeader.textContent = 'Grouped Jobs in Main Queue';
    contentEl.appendChild(queueHeader);

    var queueDesc = document.createElement('p');
    queueDesc.style.cssText = 'margin:0 0 0.75rem;font-size:0.8rem;color:${colors.muted};';
    queueDesc.textContent = 'Jobs in the main queue that were created by the grouping engine after a window expired.';
    contentEl.appendChild(queueDesc);

    if (mainQueueGrouped.length === 0) {
      var emptyQueue = document.createElement('div');
      emptyQueue.style.cssText = 'color:${colors.muted};font-size:0.85rem;padding:1rem 0;';
      emptyQueue.textContent = 'No grouped jobs in the main queue.';
      contentEl.appendChild(emptyQueue);
    } else {
      var table = document.createElement('table');
      table.style.cssText = 'width:100%;border-collapse:collapse;font-size:0.8rem;';

      var thead = document.createElement('thead');
      thead.innerHTML = '<tr style="border-bottom:1px solid ${colors.border};">' +
        '<th style="text-align:left;padding:0.4rem 0.5rem;color:${colors.muted};font-size:0.7rem;text-transform:uppercase;letter-spacing:0.05em;">ID</th>' +
        '<th style="text-align:left;padding:0.4rem 0.5rem;color:${colors.muted};font-size:0.7rem;text-transform:uppercase;letter-spacing:0.05em;">Status</th>' +
        '<th style="text-align:left;padding:0.4rem 0.5rem;color:${colors.muted};font-size:0.7rem;text-transform:uppercase;letter-spacing:0.05em;">Group Key</th>' +
        '<th style="text-align:left;padding:0.4rem 0.5rem;color:${colors.muted};font-size:0.7rem;text-transform:uppercase;letter-spacing:0.05em;">Rule</th>' +
        '<th style="text-align:right;padding:0.4rem 0.5rem;color:${colors.muted};font-size:0.7rem;text-transform:uppercase;letter-spacing:0.05em;">Jobs</th>' +
        '<th style="text-align:left;padding:0.4rem 0.5rem;color:${colors.muted};font-size:0.7rem;text-transform:uppercase;letter-spacing:0.05em;">Created</th>' +
        '</tr>';
      table.appendChild(thead);

      var tbody = document.createElement('tbody');
      mainQueueGrouped.forEach(function(j) {
        var statusColor = j.status === 'pending' ? '${colors.warning}' :
                          j.status === 'running' ? '${colors.accent}' :
                          j.status === 'completed' ? '${colors.success}' :
                          j.status === 'failed' ? '${colors.danger}' : '${colors.muted}';
        var tr = document.createElement('tr');
        tr.style.cssText = 'border-bottom:1px solid ${colors.border};';
        tr.innerHTML = '<td style="padding:0.4rem 0.5rem;color:${colors.text};">' + j.id + '</td>' +
          '<td style="padding:0.4rem 0.5rem;"><span style="color:' + statusColor + ';font-weight:600;">' + escapeHtml(j.status) + '</span></td>' +
          '<td style="padding:0.4rem 0.5rem;color:${colors.text};">' + escapeHtml(j.groupKey) + '</td>' +
          '<td style="padding:0.4rem 0.5rem;color:${colors.muted};max-width:250px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escapeHtml(j.ruleDescription) + '</td>' +
          '<td style="padding:0.4rem 0.5rem;text-align:right;color:${colors.text};">' + j.jobCount + '</td>' +
          '<td style="padding:0.4rem 0.5rem;color:${colors.muted};font-size:0.75rem;">' + escapeHtml(j.createdAt) + '</td>';
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      contentEl.appendChild(table);
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  load();
  setInterval(load, 30000);
})();
`}}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Rules sub-page (original JobGroupingPanel content)                 */
/* ------------------------------------------------------------------ */

export function JobGroupingRulesPanel() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "1rem 1.5rem 0.75rem",
          borderBottom: `1px solid ${colors.border}`,
          background: colors.surface,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 600 }}>
              Job Grouping Rules
            </h2>
            <p
              style={{
                margin: "0.25rem 0 0",
                fontSize: "0.8rem",
                color: colors.muted,
              }}
            >
              Define English prompts to group jobs by time window. JavaScript
              matching code is auto-generated.
            </p>
          </div>
          <button
            id="jg-add-btn"
            style={{
              padding: "0.4rem 0.9rem",
              borderRadius: "0.375rem",
              border: "none",
              background: colors.accent,
              color: "oklch(1 0 0)",
              fontWeight: 600,
              fontSize: "0.8rem",
              cursor: "pointer",
            }}
          >
            + Add Rule
          </button>
        </div>
      </div>

      {/* New rule form (hidden by default) */}
      <div
        id="jg-new-form"
        style={{
          display: "none",
          padding: "1rem 1.5rem",
          borderBottom: `1px solid ${colors.border}`,
          background: colors.surface,
        }}
      >
        <label
          style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, marginBottom: "0.4rem" }}
        >
          Describe the grouping rule in English:
        </label>
        <textarea
          id="jg-new-prompt"
          rows={3}
          placeholder='e.g. "Group all emails to stores@ addresses by hour before passing to the model"'
          style={{
            width: "100%",
            padding: "0.5rem 0.75rem",
            borderRadius: "0.375rem",
            border: `1px solid ${colors.border}`,
            background: colors.bg,
            color: colors.text,
            fontSize: "0.85rem",
            fontFamily: "inherit",
            resize: "vertical",
            boxSizing: "border-box",
          }}
        />
        <div
          style={{
            marginTop: "0.5rem",
            display: "flex",
            gap: "0.5rem",
            alignItems: "center",
          }}
        >
          <button
            id="jg-save-btn"
            style={{
              padding: "0.35rem 0.9rem",
              borderRadius: "0.375rem",
              border: "none",
              background: colors.accent,
              color: "oklch(1 0 0)",
              fontWeight: 600,
              fontSize: "0.8rem",
              cursor: "pointer",
            }}
          >
            Generate &amp; Save
          </button>
          <button
            id="jg-cancel-btn"
            style={{
              padding: "0.35rem 0.9rem",
              borderRadius: "0.375rem",
              border: `1px solid ${colors.border}`,
              background: "transparent",
              color: colors.muted,
              fontWeight: 600,
              fontSize: "0.8rem",
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <span
            id="jg-save-status"
            style={{ fontSize: "0.75rem", color: colors.muted }}
          />
        </div>
      </div>

      {/* Rules list */}
      <div
        id="jg-rules"
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "0.75rem 1.5rem",
        }}
      >
        <div
          style={{
            color: colors.muted,
            fontSize: "0.85rem",
            textAlign: "center",
            padding: "2rem 0",
          }}
        >
          Loading&hellip;
        </div>
      </div>

      {/* Pending groups info */}
      <div
        id="jg-pending"
        style={{
          padding: "0.75rem 1.5rem",
          borderTop: `1px solid ${colors.border}`,
          background: colors.surface,
          fontSize: "0.8rem",
          color: colors.muted,
          display: "none",
        }}
      >
        <strong>Pending Groups:</strong>{" "}
        <span id="jg-pending-info" />
      </div>

      {/* Client script */}
      <script
        dangerouslySetInnerHTML={{
          __html: `
(function() {
  var rulesEl = document.getElementById('jg-rules');
  var addBtn = document.getElementById('jg-add-btn');
  var newForm = document.getElementById('jg-new-form');
  var newPrompt = document.getElementById('jg-new-prompt');
  var saveBtn = document.getElementById('jg-save-btn');
  var cancelBtn = document.getElementById('jg-cancel-btn');
  var saveStatus = document.getElementById('jg-save-status');
  var pendingEl = document.getElementById('jg-pending');
  var pendingInfo = document.getElementById('jg-pending-info');
  var editingId = null;

  addBtn.addEventListener('click', function() {
    editingId = null;
    newPrompt.value = '';
    saveBtn.textContent = 'Generate & Save';
    newForm.style.display = 'block';
    newPrompt.focus();
  });

  cancelBtn.addEventListener('click', function() {
    newForm.style.display = 'none';
    editingId = null;
  });

  saveBtn.addEventListener('click', function() {
    var prompt = newPrompt.value.trim();
    if (!prompt) return;

    saveBtn.disabled = true;
    saveBtn.textContent = 'Generating...';
    saveStatus.textContent = '';
    saveStatus.style.color = '${colors.muted}';

    var url = editingId ? '/api/job-grouping/rules/' + editingId : '/api/job-grouping/rules';
    var method = editingId ? 'PUT' : 'POST';

    fetch(url, {
      method: method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: prompt })
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.error) {
        saveStatus.textContent = 'Error: ' + data.error;
        saveStatus.style.color = '${colors.danger}';
      } else {
        newForm.style.display = 'none';
        editingId = null;
        loadRules();
      }
    })
    .catch(function(err) {
      saveStatus.textContent = 'Failed: ' + err.message;
      saveStatus.style.color = '${colors.danger}';
    })
    .finally(function() {
      saveBtn.disabled = false;
      saveBtn.textContent = editingId ? 'Regenerate & Save' : 'Generate & Save';
    });
  });

  function loadRules() {
    fetch('/api/job-grouping/rules')
      .then(function(r) { return r.json(); })
      .then(function(data) {
        renderRules(data.rules || []);
      })
      .catch(function(err) {
        rulesEl.innerHTML = '<div style="color:${colors.danger};padding:1rem;">Error: ' + err.message + '</div>';
      });
  }

  function renderRules(rules) {
    rulesEl.innerHTML = '';
    if (rules.length === 0) {
      rulesEl.innerHTML = '<div style="color:${colors.muted};text-align:center;padding:2rem 0;font-size:0.85rem;">No grouping rules yet. Click "+ Add Rule" to create one.</div>';
      return;
    }

    rules.forEach(function(rule) {
      var card = document.createElement('div');
      card.style.cssText = 'margin-bottom:1rem;border:1px solid ${colors.border};border-radius:0.5rem;overflow:hidden;background:${colors.surface};';

      // Card header: prompt + actions
      var header = document.createElement('div');
      header.style.cssText = 'padding:0.75rem 1rem;display:flex;align-items:flex-start;gap:0.75rem;';

      var promptDiv = document.createElement('div');
      promptDiv.style.cssText = 'flex:1;';

      var promptLabel = document.createElement('div');
      promptLabel.style.cssText = 'font-size:0.7rem;text-transform:uppercase;letter-spacing:0.05em;color:${colors.muted};margin-bottom:0.25rem;';
      promptLabel.textContent = 'Prompt';
      promptDiv.appendChild(promptLabel);

      var promptText = document.createElement('div');
      promptText.style.cssText = 'font-size:0.85rem;color:${colors.text};line-height:1.4;';
      promptText.textContent = rule.prompt;
      promptDiv.appendChild(promptText);

      header.appendChild(promptDiv);

      // Action buttons
      var actions = document.createElement('div');
      actions.style.cssText = 'display:flex;gap:0.4rem;flex-shrink:0;';

      var editBtn = document.createElement('button');
      editBtn.textContent = 'Edit';
      editBtn.style.cssText = 'padding:0.25rem 0.6rem;border-radius:0.25rem;border:1px solid ${colors.border};background:transparent;color:${colors.muted};font-size:0.75rem;cursor:pointer;';
      editBtn.addEventListener('click', function() {
        editingId = rule.id;
        newPrompt.value = rule.prompt;
        saveBtn.textContent = 'Regenerate & Save';
        newForm.style.display = 'block';
        newPrompt.focus();
      });
      actions.appendChild(editBtn);

      var delBtn = document.createElement('button');
      delBtn.textContent = 'Delete';
      delBtn.style.cssText = 'padding:0.25rem 0.6rem;border-radius:0.25rem;border:1px solid ${colors.border};background:transparent;color:${colors.danger};font-size:0.75rem;cursor:pointer;';
      delBtn.addEventListener('click', function() {
        if (!confirm('Delete this rule?')) return;
        fetch('/api/job-grouping/rules/' + rule.id, { method: 'DELETE' })
          .then(function() { loadRules(); });
      });
      actions.appendChild(delBtn);

      header.appendChild(actions);
      card.appendChild(header);

      // Code section
      var codeSection = document.createElement('div');
      codeSection.style.cssText = 'border-top:1px solid ${colors.border};';

      var codeLabel = document.createElement('div');
      codeLabel.style.cssText = 'padding:0.5rem 1rem 0.25rem;font-size:0.7rem;text-transform:uppercase;letter-spacing:0.05em;color:${colors.muted};';
      codeLabel.textContent = 'Generated JavaScript';
      codeSection.appendChild(codeLabel);

      var codeBlock = document.createElement('pre');
      codeBlock.style.cssText = 'margin:0;padding:0.5rem 1rem 0.75rem;font-size:0.8rem;font-family:\\'SF Mono\\',\\'Fira Code\\',\\'JetBrains Mono\\',Menlo,monospace;color:${colors.text};overflow-x:auto;line-height:1.5;white-space:pre-wrap;word-break:break-word;';
      codeBlock.textContent = 'code(job) ' + rule.generatedCode;
      codeSection.appendChild(codeBlock);

      card.appendChild(codeSection);

      // Metadata footer
      var footer = document.createElement('div');
      footer.style.cssText = 'padding:0.4rem 1rem;border-top:1px solid ${colors.border};font-size:0.7rem;color:${colors.muted};display:flex;gap:1rem;';
      footer.innerHTML = '<span>ID: ' + rule.id + '</span><span>Created: ' + (rule.createdAt || 'n/a') + '</span>' + (rule.updatedAt ? '<span>Updated: ' + rule.updatedAt + '</span>' : '');
      card.appendChild(footer);

      rulesEl.appendChild(card);
    });
  }

  function loadPending() {
    fetch('/api/job-grouping/pending')
      .then(function(r) { return r.json(); })
      .then(function(data) {
        var groups = data.groups || [];
        if (groups.length === 0) {
          pendingEl.style.display = 'none';
          return;
        }
        pendingEl.style.display = 'block';
        var parts = groups.map(function(g) {
          return g.group_key + ' (' + g.job_count + ' jobs, window: ' + g.window_start + ')';
        });
        pendingInfo.textContent = parts.join('; ');
      })
      .catch(function() {
        pendingEl.style.display = 'none';
      });
  }

  loadRules();
  loadPending();
  // Refresh pending groups every 30s
  setInterval(loadPending, 30000);
})();
`}}
      />
    </div>
  );
}
