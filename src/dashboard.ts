/**
 * Dashboard HTML — single-page debug UI with tabs:
 *   - Logs (real-time SSE stream with filters)
 *   - Sessions (session-centric management: events master/detail + resources)
 *   - Sandboxes (lifecycle, structured cards)
 */

export const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>OpenMA Verification Console</title>
  <style>
    :root {
      --bg: #0d1117; --bg2: #161b22; --bg3: #1c2128; --border: #30363d;
      --text: #c9d1d9; --muted: #8b949e;
      --blue: #58a6ff; --green: #3fb950; --red: #f85149;
      --purple: #a371f7; --yellow: #d29922; --cyan: #79c0ff;
      --orange: #f0883e;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace; background: var(--bg); color: var(--text); font-size: 13px; }

    /* Header */
    header { padding: 10px 20px; background: var(--bg2); border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; }
    header h1 { font-size: 14px; color: var(--blue); font-weight: 600; }
    .header-right { display: flex; align-items: center; gap: 12px; }
    .status-badge { font-size: 11px; padding: 3px 8px; border-radius: 10px; }
    .status-badge.on { background: #1b4332; color: var(--green); }
    .status-badge.off { background: #3d1f1f; color: var(--red); }
    .sse-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--red); }
    .sse-dot.connected { background: var(--green); animation: pulse 2s infinite; }
    @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.5; } }

    /* Top-level tabs */
    .tabs { display: flex; background: var(--bg2); border-bottom: 1px solid var(--border); }
    .tab { padding: 8px 20px; cursor: pointer; color: var(--muted); border-bottom: 2px solid transparent; font-size: 12px; }
    .tab:hover { color: var(--text); }
    .tab.active { color: var(--blue); border-bottom-color: var(--blue); }
    .tab-content { display: none; height: calc(100vh - 90px); overflow: hidden; }
    .tab-content.active { display: flex; flex-direction: column; }

    /* Toolbar */
    .toolbar { padding: 8px 16px; background: var(--bg2); border-bottom: 1px solid var(--border); display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
    .toolbar select, .toolbar input { background: var(--bg); border: 1px solid var(--border); color: var(--text); padding: 4px 8px; border-radius: 4px; font-size: 11px; font-family: inherit; }
    .toolbar input { width: 180px; }
    .btn { background: #21262d; border: 1px solid var(--border); color: var(--text); padding: 4px 12px; border-radius: 4px; cursor: pointer; font-family: inherit; font-size: 11px; }
    .btn:hover { background: #30363d; }
    .btn.primary { background: #1f6feb; border-color: #388bfd; color: #fff; }
    .btn.primary:hover { background: #2d7bf0; }
    .btn.sm { padding: 2px 8px; font-size: 10px; }
    .badge { font-size: 10px; padding: 2px 6px; border-radius: 8px; text-transform: uppercase; }
    .badge.running, .badge.spawning { background: #1b4332; color: var(--green); }
    .badge.exited { background: #3d1f1f; color: var(--red); }
    .badge.ready { background: #2d333b; color: var(--muted); }

    /* Logs */
    .log-feed { flex: 1; overflow-y: auto; padding: 4px 16px; font-size: 11px; line-height: 1.8; }
    .log-entry { border-bottom: 1px solid #21262d; padding: 2px 0; display: flex; gap: 10px; }
    .log-entry.filtered { display: none; }
    .log-ts { color: var(--muted); white-space: nowrap; min-width: 70px; }
    .log-cat { min-width: 60px; font-weight: 600; }
    .log-msg { flex: 1; word-break: break-word; }

    /* Sessions layout */
    .sessions-layout { display: flex; flex: 1; overflow: hidden; }
    .ses-sidebar { width: 240px; min-width: 200px; border-right: 1px solid var(--border); display: flex; flex-direction: column; background: var(--bg2); }
    .ses-sidebar-header { padding: 10px; border-bottom: 1px solid var(--border); display: flex; flex-direction: column; gap: 6px; }
    .ses-sidebar-list { flex: 1; overflow-y: auto; }
    .ses-item { padding: 8px 10px; border-bottom: 1px solid var(--border); cursor: pointer; }
    .ses-item:hover { background: #21262d; }
    .ses-item.active { background: #1c2128; border-left: 3px solid var(--blue); }
    .ses-item-id { font-size: 10px; color: var(--blue); font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .ses-item-meta { font-size: 10px; color: var(--muted); margin-top: 2px; }
    .ses-main { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
    .ses-empty { flex: 1; display: flex; align-items: center; justify-content: center; color: var(--muted); font-size: 12px; }
    .ses-info { padding: 8px 16px; background: var(--bg2); border-bottom: 1px solid var(--border); font-size: 11px; }
    .ses-info-row { display: flex; gap: 16px; align-items: center; flex-wrap: wrap; }
    .ses-info-item span { color: var(--blue); }

    /* Session sub-tabs */
    .ses-subtabs { display: flex; background: var(--bg2); border-bottom: 1px solid var(--border); }
    .ses-subtab { padding: 6px 16px; cursor: pointer; color: var(--muted); font-size: 11px; border-bottom: 2px solid transparent; }
    .ses-subtab:hover { color: var(--text); }
    .ses-subtab.active { color: var(--cyan); border-bottom-color: var(--cyan); }

    /* Events master/detail */
    .ev-layout { flex: 1; display: flex; overflow: hidden; }
    .ev-list-panel { width: 320px; min-width: 260px; border-right: 1px solid var(--border); display: flex; flex-direction: column; background: var(--bg); }
    .ev-filter-tabs { display: flex; border-bottom: 1px solid var(--border); background: var(--bg2); flex-shrink: 0; }
    .ev-filter-tab { padding: 5px 8px; cursor: pointer; color: var(--muted); font-size: 10px; border-bottom: 2px solid transparent; white-space: nowrap; }
    .ev-filter-tab:hover { color: var(--text); }
    .ev-filter-tab.active { color: var(--green); border-bottom-color: var(--green); }
    .ev-filter-tab .ev-count-badge { font-size: 9px; background: var(--bg3); padding: 1px 4px; border-radius: 6px; margin-left: 3px; }
    .ev-list-toolbar { display: flex; padding: 4px 8px; gap: 6px; align-items: center; background: var(--bg2); border-bottom: 1px solid var(--border); flex-shrink: 0; }
    .ev-list-scroll { flex: 1; overflow-y: auto; }
    .ev-item { padding: 6px 10px; border-bottom: 1px solid #21262d; cursor: pointer; display: flex; flex-direction: column; gap: 2px; }
    .ev-item:hover { background: var(--bg2); }
    .ev-item.selected { background: #1c2128; border-left: 3px solid var(--cyan); }
    .ev-item-header { display: flex; align-items: center; gap: 6px; }
    .ev-item-type { font-size: 9px; font-weight: 700; padding: 1px 5px; border-radius: 3px; text-transform: uppercase; }
    .ev-item-type.user { background: #1b3a4b; color: var(--cyan); }
    .ev-item-type.agent { background: #1b4332; color: var(--green); }
    .ev-item-type.tool { background: #3d2800; color: var(--orange); }
    .ev-item-type.error { background: #3d1f1f; color: var(--red); }
    .ev-item-type.system { background: #2d333b; color: var(--muted); }
    .ev-item-ts { font-size: 9px; color: var(--muted); margin-left: auto; }
    .ev-item-preview { font-size: 10px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%; }

    /* Event detail panel */
    .ev-detail-panel { flex: 1; display: flex; flex-direction: column; overflow: hidden; background: var(--bg); }
    .ev-detail-toolbar { display: flex; padding: 6px 12px; gap: 8px; align-items: center; background: var(--bg2); border-bottom: 1px solid var(--border); flex-shrink: 0; }
    .ev-detail-empty { flex: 1; display: flex; align-items: center; justify-content: center; color: var(--muted); font-size: 11px; }
    .ev-detail-content { flex: 1; overflow-y: auto; padding: 12px 16px; }
    .ev-detail-content .ev-bubble { max-width: 100%; padding: 10px 14px; border-radius: 8px; font-size: 12px; line-height: 1.6; word-break: break-word; }
    .ev-detail-content .ev-bubble.user { background: #1b3a4b; color: var(--cyan); white-space: pre-wrap; }
    .ev-detail-content .ev-bubble.agent { background: #1b4332; color: #e6edf3; }
    .ev-detail-content .md-content { white-space: normal; }
    .ev-detail-content .md-content .md-h { margin: 12px 0 6px 0; color: var(--fg); font-weight: 700; }
    .ev-detail-content .md-content h1.md-h { font-size: 16px; border-bottom: 1px solid var(--border); padding-bottom: 4px; }
    .ev-detail-content .md-content h2.md-h { font-size: 14px; }
    .ev-detail-content .md-content h3.md-h { font-size: 13px; }
    .ev-detail-content .md-content .md-p { margin: 4px 0; line-height: 1.6; }
    .ev-detail-content .md-content .md-list { margin: 4px 0 4px 16px; padding: 0; }
    .ev-detail-content .md-content .md-list li { margin: 2px 0; }
    .ev-detail-content .md-content .md-code-block { background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.1); border-radius: 4px; padding: 8px 10px; font-size: 11px; line-height: 1.5; overflow-x: auto; white-space: pre; margin: 8px 0; color: #e6edf3; }
    .ev-detail-content .md-content .md-inline-code { background: rgba(0,0,0,0.3); padding: 1px 5px; border-radius: 3px; font-size: 11px; color: #f0f6fc; }
    .ev-detail-content .md-content strong { color: #fff; }
    .ev-detail-content .md-content em { font-style: italic; opacity: 0.9; }
    .ev-detail-content .md-content .md-table { width: 100%; border-collapse: collapse; margin: 8px 0; font-size: 11px; }
    .ev-detail-content .md-content .md-table th { background: rgba(0,0,0,0.25); border: 1px solid rgba(255,255,255,0.15); padding: 6px 10px; text-align: left; font-weight: 700; color: #fff; }
    .ev-detail-content .md-content .md-table td { border: 1px solid rgba(255,255,255,0.12); padding: 5px 10px; color: #e6edf3; }
    .ev-detail-content .md-content .md-hr { border: none; border-top: 1px solid var(--border); margin: 12px 0; }
    .ev-detail-content .ev-tool-section { margin: 8px 0; }
    .ev-detail-content .ev-tool-name { font-size: 11px; font-weight: 700; color: var(--orange); margin-bottom: 4px; }
    .ev-detail-content .ev-tool-body { background: var(--bg2); border: 1px solid var(--border); border-radius: 6px; padding: 10px 12px; font-size: 11px; white-space: pre-wrap; word-break: break-word; line-height: 1.5; max-height: 500px; overflow-y: auto; }
    .ev-detail-content .ev-raw-block { background: var(--bg2); border: 1px solid var(--border); border-radius: 6px; padding: 12px 14px; font-size: 11px; white-space: pre-wrap; word-break: break-word; line-height: 1.5; }
    .ev-detail-meta { margin-top: 12px; padding-top: 8px; border-top: 1px solid var(--border); font-size: 10px; color: var(--muted); }
    .ev-detail-meta dt { display: inline; font-weight: 600; }
    .ev-detail-meta dd { display: inline; margin-right: 12px; }

    /* Toggle group */
    .toggle-group { display: flex; border: 1px solid var(--border); border-radius: 4px; overflow: hidden; }
    .toggle-btn { background: var(--bg); border: none; color: var(--muted); padding: 3px 10px; font-size: 10px; cursor: pointer; font-family: inherit; }
    .toggle-btn:not(:last-child) { border-right: 1px solid var(--border); }
    .toggle-btn.active { background: #21262d; color: var(--text); }
    .toggle-btn:hover { color: var(--text); }

    /* Resources panel */
    .res-panel { flex: 1; overflow-y: auto; padding: 16px; display: none; }
    .res-panel.active { display: block; }
    .res-section { margin-bottom: 16px; }
    .res-section-title { font-size: 11px; font-weight: 700; color: var(--cyan); margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px; }
    .res-card { background: var(--bg2); border: 1px solid var(--border); border-radius: 6px; padding: 12px 14px; margin-bottom: 8px; }
    .res-card dl { display: grid; grid-template-columns: auto 1fr; gap: 3px 12px; font-size: 11px; }
    .res-card dt { color: var(--muted); }
    .res-card dd { color: var(--text); overflow: hidden; text-overflow: ellipsis; }
    .res-empty { color: var(--muted); font-size: 11px; font-style: italic; }

    /* Send message bar */
    .ses-send { padding: 10px 16px; background: var(--bg2); border-top: 1px solid var(--border); display: flex; gap: 8px; flex-shrink: 0; }
    .ses-send input { flex: 1; background: var(--bg); border: 1px solid var(--border); color: var(--text); padding: 6px 10px; border-radius: 4px; font-size: 12px; font-family: inherit; }
    .ses-send input:focus { border-color: var(--blue); outline: none; }

    /* Sandbox cards */
    .card-grid { flex: 1; overflow-y: auto; padding: 16px; display: grid; grid-template-columns: repeat(auto-fill, minmax(420px, 1fr)); gap: 12px; align-content: start; }
    .card { background: var(--bg2); border: 1px solid var(--border); border-radius: 8px; padding: 14px 16px; }
    .card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
    .card-header h3 { font-size: 13px; color: var(--blue); font-weight: 600; }
    .card-meta { display: grid; grid-template-columns: auto 1fr; gap: 4px 12px; font-size: 11px; margin-bottom: 10px; }
    .card-meta dt { color: var(--muted); }
    .card-meta dd { color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .card-section { margin-top: 8px; }
    .card-section-header { font-size: 10px; font-weight: 600; color: var(--muted); cursor: pointer; padding: 4px 0; display: flex; align-items: center; gap: 4px; }
    .card-section-header:hover { color: var(--text); }
    .card-section-body { background: var(--bg); border: 1px solid var(--border); border-radius: 4px; padding: 8px; font-size: 11px; max-height: 150px; overflow-y: auto; white-space: pre-wrap; word-break: break-all; display: none; margin-top: 4px; }
    .card-section-body.open { display: block; }
    .card-actions { margin-top: 10px; display: flex; gap: 6px; }
  </style>
</head>
<body>
  <header>
    <h1>OpenMA Verification Console</h1>
    <div class="header-right">
      <span id="poll-badge" class="status-badge off">poll: off</span>
      <span id="sandbox-count" style="font-size:11px;color:var(--muted)">sandboxes: 0</span>
      <div id="sse-dot" class="sse-dot" title="SSE connection"></div>
    </div>
  </header>

  <div class="tabs">
    <div class="tab active" data-tab="logs">Logs</div>
    <div class="tab" data-tab="sessions">Sessions</div>
    <div class="tab" data-tab="agents">Agents</div>
    <div class="tab" data-tab="sandboxes">Sandboxes</div>
  </div>

  <!-- LOGS TAB -->
  <div id="tab-logs" class="tab-content active">
    <div class="toolbar">
      <select id="f-cat">
        <option value="">All Categories</option>
        <option value="poll">poll</option><option value="ack">ack</option>
        <option value="spawn">spawn</option><option value="heartbeat">heartbeat</option>
        <option value="session">session</option><option value="sandbox">sandbox</option>
        <option value="system">system</option>
      </select>
      <select id="f-level">
        <option value="">All Levels</option>
        <option value="info">info</option><option value="warn">warn</option><option value="error">error</option>
      </select>
      <input id="f-text" placeholder="Filter text..." />
      <span id="log-count" style="font-size:11px;color:var(--muted)">0 entries</span>
      <button class="btn sm" style="margin-left:auto" onclick="clearLogs()">Clear</button>
      <button class="btn sm" onclick="scrollBottom()">↓ Bottom</button>
    </div>
    <div class="log-feed" id="logs"></div>
  </div>

  <!-- SESSIONS TAB -->
  <div id="tab-sessions" class="tab-content">
    <div class="sessions-layout">
      <!-- Sidebar -->
      <div class="ses-sidebar">
        <div class="ses-sidebar-header">
          <button class="btn primary" style="width:100%" onclick="showCreateSession()">+ Create Session</button>
          <select id="ses-agent-filter" style="font-size:11px;padding:4px 6px;background:var(--bg);border:1px solid var(--border);color:var(--text);border-radius:4px;font-family:inherit;width:100%" onchange="onAgentFilterChange()">
            <option value="">All Agents</option>
          </select>
          <div style="display:flex;gap:4px">
            <input id="ses-manual-id" placeholder="Session ID..." style="flex:1;font-size:11px;padding:4px 6px;background:var(--bg);border:1px solid var(--border);color:var(--text);border-radius:4px;font-family:inherit" />
            <button class="btn sm" onclick="selectSessionById(document.getElementById('ses-manual-id').value.trim())">Go</button>
          </div>
        </div>
        <div class="ses-sidebar-list" id="ses-list"></div>
      </div>
      <!-- Main panel -->
      <div class="ses-main" id="ses-main">
        <div class="ses-empty" id="ses-empty">Select a session from the sidebar or create a new one</div>
        <!-- Create session form -->
        <div id="ses-create-form" style="display:none;padding:16px;flex:1">
          <h3 style="color:var(--blue);margin-bottom:12px;font-size:13px">Create New Session</h3>
          <div style="display:flex;flex-direction:column;gap:8px;max-width:400px">
            <input id="ses-create-agent" placeholder="Agent ID (required)" style="padding:6px 10px;background:var(--bg);border:1px solid var(--border);color:var(--text);border-radius:4px;font-family:inherit;font-size:12px" />
            <input id="ses-create-msg" placeholder="Initial message (optional)" style="padding:6px 10px;background:var(--bg);border:1px solid var(--border);color:var(--text);border-radius:4px;font-family:inherit;font-size:12px" />
            <div style="display:flex;gap:8px">
              <button class="btn primary" onclick="doCreateSession()">Create</button>
              <button class="btn" onclick="hideCreateSession()">Cancel</button>
            </div>
            <div id="ses-create-result" style="font-size:11px;margin-top:4px"></div>
          </div>
        </div>
        <!-- Session detail -->
        <div id="ses-detail" style="display:none;flex:1;flex-direction:column;overflow:hidden">
          <div class="ses-info" id="ses-info-bar"></div>
          <div class="ses-subtabs">
            <div class="ses-subtab active" data-subtab="events" onclick="switchSubtab('events')">Events</div>
            <div class="ses-subtab" data-subtab="resources" onclick="switchSubtab('resources')">Resources</div>
          </div>
          <!-- Events sub-view -->
          <div id="subtab-events" class="ev-layout">
            <div class="ev-list-panel">
              <div class="ev-filter-tabs" id="ev-filter-tabs">
                <div class="ev-filter-tab active" data-filter="all" onclick="setEvFilter('all')">All</div>
                <div class="ev-filter-tab" data-filter="user" onclick="setEvFilter('user')">User</div>
                <div class="ev-filter-tab" data-filter="agent" onclick="setEvFilter('agent')">Agent</div>
                <div class="ev-filter-tab" data-filter="tool" onclick="setEvFilter('tool')">Tool</div>
                <div class="ev-filter-tab" data-filter="error" onclick="setEvFilter('error')">Error</div>
                <div class="ev-filter-tab" data-filter="system" onclick="setEvFilter('system')">System</div>
              </div>
              <div class="ev-list-toolbar">
                <span style="font-size:10px;color:var(--muted)" id="ev-total-count">0 events</span>
                <button class="btn sm" style="margin-left:auto" onclick="refreshEvents()">↻</button>
              </div>
              <div class="ev-list-scroll" id="ev-list"></div>
            </div>
            <div class="ev-detail-panel">
              <div class="ev-detail-toolbar">
                <span style="font-size:10px;color:var(--muted)" id="ev-detail-title">No event selected</span>
                <div class="toggle-group" style="margin-left:auto">
                  <button class="toggle-btn active" id="ev-detail-preview" onclick="setDetailMode('preview')">Preview</button>
                  <button class="toggle-btn" id="ev-detail-raw" onclick="setDetailMode('raw')">Raw</button>
                </div>
              </div>
              <div class="ev-detail-empty" id="ev-detail-empty">Click an event to view details</div>
              <div class="ev-detail-content" id="ev-detail-content" style="display:none"></div>
            </div>
          </div>
          <!-- Resources sub-view -->
          <div id="subtab-resources" class="res-panel"></div>
          <!-- Send bar -->
          <div class="ses-send" id="ses-send-bar">
            <input id="ses-send-input" placeholder="Type a message..." onkeydown="if(event.key==='Enter')doSendMessage()" />
            <button class="btn primary" onclick="doSendMessage()">Send</button>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- AGENTS TAB -->
  <div id="tab-agents" class="tab-content">
    <div id="agents-panel" style="flex:1;overflow-y:auto;padding:0"></div>
  </div>

  <!-- SANDBOXES TAB -->
  <div id="tab-sandboxes" class="tab-content">
    <div class="toolbar">
      <button class="btn" onclick="refreshSandboxes()">Refresh</button>
      <button class="btn" onclick="clearExitedSandboxes()" style="color:var(--red)">Clear Exited</button>
      <span style="font-size:11px;color:var(--muted)" id="sb-stats"></span>
    </div>
    <div class="card-grid" id="sandbox-grid"></div>
  </div>

  <script>
    // === Utilities ===
    function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
    function fmtTime(ts) { if (!ts) return '-'; return new Date(ts).toLocaleTimeString('en-US',{hour12:false,hour:'2-digit',minute:'2-digit',second:'2-digit'}); }
    function fmtDuration(ms) { if (!ms || ms < 0) return '-'; const s = Math.floor(ms/1000); if (s < 60) return s+'s'; return Math.floor(s/60)+'m '+s%60+'s'; }
    function truncId(id, n) { return id ? (id.length > n ? id.slice(0,n)+'...' : id) : '-'; }

    // === Lightweight Markdown Renderer ===
    function renderMd(text) {
      if (!text) return '';
      // Escape HTML first
      let s = esc(text);
      // Code blocks (triple-backtick)
      var cbRegex = new RegExp('\\x60\\x60\\x60(\\\\w*)\\n([\\\\s\\\\S]*?)\\x60\\x60\\x60', 'g');
      s = s.replace(cbRegex, function(_, lang, code) {
        return '<pre class="md-code-block"><code>' + code.trimEnd() + '</code></pre>';
      });
      // Split into lines for block-level processing
      const lines = s.split('\\n');
      let html = '';
      let inList = false;
      for (let i = 0; i < lines.length; i++) {
        let line = lines[i];
        // Skip if inside a code block (already handled)
        if (line.includes('<pre class="md-code-block">')) {
          html += line + '\\n';
          while (i < lines.length - 1 && !lines[i].includes('</pre>')) { i++; html += lines[i] + '\\n'; }
          inList = false;
          continue;
        }
        // Headings
        if (line.match(/^#{1,6}\\s/)) {
          if (inList) { html += '</ul>'; inList = false; }
          const level = line.match(/^(#+)/)[1].length;
          const content = line.replace(/^#+\\s*/, '');
          html += '<h' + level + ' class="md-h">' + content + '</h' + level + '>';
          continue;
        }
        // Table detection: line starts with |
        if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
          if (inList) { html += '</ul>'; inList = false; }
          // Collect all consecutive table lines
          var tableLines = [];
          while (i < lines.length && lines[i].trim().startsWith('|') && lines[i].trim().endsWith('|')) {
            tableLines.push(lines[i]);
            i++;
          }
          i--; // back up one since the for loop will i++
          html += renderTable(tableLines);
          continue;
        }
        // Unordered list
        if (line.match(/^\\s*[-*+]\\s/)) {
          if (!inList) { html += '<ul class="md-list">'; inList = true; }
          html += '<li>' + inlineFormat(line.replace(/^\\s*[-*+]\\s/, '')) + '</li>';
          continue;
        }
        // Ordered list
        if (line.match(/^\\s*\\d+\\.\\s/)) {
          if (!inList) { html += '<ul class="md-list">'; inList = true; }
          html += '<li>' + inlineFormat(line.replace(/^\\s*\\d+\\.\\s/, '')) + '</li>';
          continue;
        }
        // Close list if not a list item
        if (inList) { html += '</ul>'; inList = false; }
        // Horizontal rule
        if (line.match(/^-{3,}$/) || line.match(/^\\*{3,}$/) || line.match(/^_{3,}$/)) {
          html += '<hr class="md-hr">';
          continue;
        }
        // Blank line
        if (line.trim() === '') { html += '<br>'; continue; }
        // Normal paragraph line
        html += '<p class="md-p">' + inlineFormat(line) + '</p>';
      }
      if (inList) html += '</ul>';
      return html;
    }

    function renderTable(tableLines) {
      if (tableLines.length < 2) {
        // Not a valid table, just render as paragraphs
        return tableLines.map(function(l) { return '<p class="md-p">' + inlineFormat(l) + '</p>'; }).join('');
      }
      // Parse cells from a table line
      function parseCells(line) {
        return line.split('|').slice(1, -1).map(function(c) { return c.trim(); });
      }
      // Check if second line is separator (---|---)
      var sepLine = tableLines[1].trim();
      var isSep = /^\\|[\\s:|-]+\\|$/.test(sepLine);
      var startRow = isSep ? 2 : 1;
      var headers = parseCells(tableLines[0]);

      var t = '<table class="md-table"><thead><tr>';
      headers.forEach(function(h) { t += '<th>' + inlineFormat(h) + '</th>'; });
      t += '</tr></thead><tbody>';
      for (var r = startRow; r < tableLines.length; r++) {
        var cells = parseCells(tableLines[r]);
        t += '<tr>';
        cells.forEach(function(c) { t += '<td>' + inlineFormat(c) + '</td>'; });
        t += '</tr>';
      }
      t += '</tbody></table>';
      return t;
    }

    function inlineFormat(s) {
      // Inline code (backtick)
      var icRegex = new RegExp('\\x60([^\\x60]+)\\x60', 'g');
      s = s.replace(icRegex, '<code class="md-inline-code">$1</code>');
      // Bold
      s = s.replace(/\\*\\*(.+?)\\*\\*/g, '<strong>$1</strong>');
      s = s.replace(/__(.+?)__/g, '<strong>$1</strong>');
      // Italic
      s = s.replace(/\\*(.+?)\\*/g, '<em>$1</em>');
      s = s.replace(/_(.+?)_/g, '<em>$1</em>');
      // Links [text](url)
      s = s.replace(/\\[([^\\]]+)\\]\\(([^)]+)\\)/g, '<a href="$2" target="_blank" style="color:var(--accent)">$1</a>');
      return s;
    }

    // === Tab switching ===
    document.querySelectorAll('.tab').forEach(t => {
      t.onclick = () => {
        document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(x => x.classList.remove('active'));
        t.classList.add('active');
        document.getElementById('tab-' + t.dataset.tab).classList.add('active');
        if (t.dataset.tab === 'sandboxes') refreshSandboxes();
        if (t.dataset.tab === 'sessions') { loadAgents(); refreshSessionList(); }
        if (t.dataset.tab === 'agents') loadAgentsPanel();
      };
    });

    // === Status polling ===
    async function refreshStatus() {
      try {
        const r = await fetch('/api/status');
        const s = await r.json();
        const pb = document.getElementById('poll-badge');
        pb.textContent = 'poll: ' + (s.polling ? 'running' : 'stopped');
        pb.className = 'status-badge ' + (s.polling ? 'on' : 'off');
        document.getElementById('sandbox-count').textContent = 'sandboxes: ' + s.sandboxes.running + '/' + s.sandboxes.total;
      } catch {}
    }
    setInterval(refreshStatus, 3000);
    refreshStatus();

    // === Logs ===
    const logsEl = document.getElementById('logs');
    let autoScroll = true, logEntryCount = 0;

    function addLog(e) {
      const div = document.createElement('div');
      div.className = 'log-entry';
      div.dataset.cat = e.category || '';
      div.dataset.level = e.level || 'info';
      const lvlColor = e.level === 'error' ? 'var(--red)' : e.level === 'warn' ? 'var(--yellow)' : 'var(--muted)';
      const catColor = {poll:'var(--cyan)',ack:'var(--green)',spawn:'var(--orange)',heartbeat:'var(--muted)',session:'var(--blue)',sandbox:'var(--purple)',system:'var(--yellow)'}[e.category] || 'var(--text)';
      div.innerHTML = '<span class="log-ts">'+fmtTime(e.ts)+'</span><span class="log-cat" style="color:'+catColor+'">'+esc(e.category||'')+'</span><span class="log-msg" style="border-left:2px solid '+lvlColor+';padding-left:8px">'+esc(e.message)+'</span>';
      applyLogFilter(div);
      logsEl.appendChild(div);
      logEntryCount++;
      document.getElementById('log-count').textContent = logEntryCount + ' entries';
      if (autoScroll) div.scrollIntoView({block:'end'});
    }

    function applyLogFilter(el) {
      const cat = document.getElementById('f-cat').value;
      const lvl = document.getElementById('f-level').value;
      const txt = document.getElementById('f-text').value.toLowerCase();
      const hide = (cat && el.dataset.cat !== cat) || (lvl && el.dataset.level !== lvl) || (txt && !el.textContent.toLowerCase().includes(txt));
      el.classList.toggle('filtered', hide);
    }
    function refilter() { for (const el of logsEl.children) applyLogFilter(el); }
    document.getElementById('f-cat').onchange = refilter;
    document.getElementById('f-level').onchange = refilter;
    document.getElementById('f-text').oninput = refilter;
    logsEl.onscroll = () => { autoScroll = logsEl.scrollTop + logsEl.clientHeight >= logsEl.scrollHeight - 50; };
    function clearLogs() { logsEl.innerHTML = ''; logEntryCount = 0; document.getElementById('log-count').textContent = '0 entries'; }
    function scrollBottom() { logsEl.lastElementChild?.scrollIntoView({block:'end'}); }

    // Load history + SSE
    fetch('/api/logs').then(r=>r.json()).then(logs => { for (const e of logs) addLog(e); connectSSE(); });

    function connectSSE() {
      const dot = document.getElementById('sse-dot');
      const es = new EventSource('/api/logs/stream');
      es.addEventListener('log', e => addLog(JSON.parse(e.data)));
      es.onopen = () => { dot.classList.add('connected'); };
      es.onerror = () => { dot.classList.remove('connected'); es.close(); setTimeout(connectSSE, 3000); };
    }

    // ========================
    // SESSIONS
    // ========================
    let currentSessionId = null;
    let evAutoRefresh = null;
    let cachedSandboxes = [];
    let cachedEvents = [];
    let selectedEventIdx = -1;
    let evFilter = 'all';
    let detailMode = 'preview'; // 'preview' | 'raw'
    // Track sessions created locally (may not have sandbox yet)
    const knownSessions = new Map(); // sessionId -> {sessionId, name, status, createdAt}
    let cachedAgents = []; // from /api/agents
    let agentFilterId = ''; // empty = all

    async function loadAgents() {
      try {
        const r = await fetch('/api/agents');
        cachedAgents = await r.json();
        if (!Array.isArray(cachedAgents)) cachedAgents = [];
      } catch { cachedAgents = []; }
      // Populate filter dropdown
      const sel = document.getElementById('ses-agent-filter');
      sel.innerHTML = '<option value="">All Agents ('+cachedAgents.length+')</option>';
      for (const a of cachedAgents) {
        sel.innerHTML += '<option value="'+esc(a.id)+'">'+esc(a.name || a.id)+(a.model ? ' ('+esc(a.model.id)+')' : '')+'</option>';
      }
      // Also populate the create-session agent input as datalist
      let dl = document.getElementById('agent-datalist');
      if (!dl) { dl = document.createElement('datalist'); dl.id = 'agent-datalist'; document.body.appendChild(dl); }
      dl.innerHTML = cachedAgents.map(a => '<option value="'+esc(a.id)+'">'+esc(a.name || a.id)+'</option>').join('');
      const createInput = document.getElementById('ses-create-agent');
      if (createInput) createInput.setAttribute('list', 'agent-datalist');
    }

    function onAgentFilterChange() {
      agentFilterId = document.getElementById('ses-agent-filter').value;
      refreshSessionList();
    }

    async function refreshSessionList() {
      try {
        const r = await fetch('/api/sandboxes');
        cachedSandboxes = await r.json();
      } catch { cachedSandboxes = []; }

      // Merge sandbox-derived sessions with locally known sessions
      const sessions = new Map();
      for (const sb of cachedSandboxes) {
        const existing = sessions.get(sb.sessionId);
        if (!existing || sb.createdAt > existing.createdAt) {
          sessions.set(sb.sessionId, sb);
        }
      }
      // Add locally created sessions that aren't in sandbox list yet
      for (const [sid, info] of knownSessions) {
        if (!sessions.has(sid)) {
          sessions.set(sid, info);
        }
      }

      // Apply agent filter
      let filtered = [...sessions.values()];
      if (agentFilterId) {
        filtered = filtered.filter(item => item.agentId === agentFilterId);
      }

      const listEl = document.getElementById('ses-list');
      if (filtered.length === 0) {
        listEl.innerHTML = '<div style="padding:12px;color:var(--muted);font-size:11px;text-align:center">'+(agentFilterId ? 'No sessions for this agent.' : 'No sessions yet. Create one or enter an ID manually.')+'</div>';
        return;
      }

      const sorted = filtered.sort((a,b) => (b.createdAt||0) - (a.createdAt||0));
      listEl.innerHTML = sorted.map(item => {
        const sid = item.sessionId;
        const isActive = sid === currentSessionId;
        const label = item.name || 'sandbox';
        const status = item.status || 'created';
        const agentBadge = item.agentName ? '<span style="display:inline-block;font-size:9px;background:#1a3a5c;color:var(--cyan);padding:1px 4px;border-radius:3px;margin-right:3px">'+esc(item.agentName)+'</span>' : '';
        const modelBadge = item.model ? '<span style="display:inline-block;font-size:9px;background:#2d1b4e;color:var(--purple);padding:1px 4px;border-radius:3px">'+esc(item.model.replace('claude-', '').replace('-20250514', ''))+'</span>' : '';
        return '<div class="ses-item'+(isActive?' active':'')+'" onclick="selectSessionById(\\''+esc(sid)+'\\')"><div class="ses-item-id">'+esc(truncId(sid, 20))+'</div><div class="ses-item-meta">'+agentBadge+modelBadge+'</div><div class="ses-item-meta" style="margin-top:2px">'+esc(label)+' · '+status+'</div></div>';
      }).join('');
    }

    function selectSessionById(sid) {
      if (!sid) return;
      currentSessionId = sid;
      selectedEventIdx = -1;
      cachedEvents = [];
      document.getElementById('ses-empty').style.display = 'none';
      document.getElementById('ses-create-form').style.display = 'none';
      const detail = document.getElementById('ses-detail');
      detail.style.display = 'flex';

      // Clear event detail panel (prevents stale content from previous session)
      document.getElementById('ev-detail-empty').style.display = 'flex';
      document.getElementById('ev-detail-content').style.display = 'none';
      document.getElementById('ev-detail-content').innerHTML = '';
      document.getElementById('ev-detail-title').textContent = 'No event selected';
      document.getElementById('ev-list').innerHTML = '';

      // Sidebar highlight
      document.querySelectorAll('.ses-item').forEach(el => el.classList.remove('active'));
      document.querySelectorAll('.ses-item').forEach(el => {
        if (el.querySelector('.ses-item-id')?.textContent?.includes(sid.slice(0,20))) el.classList.add('active');
      });

      // Info bar
      const sb = cachedSandboxes.find(s => s.sessionId === sid);
      let infoHtml = '<div class="ses-info-row">';
      infoHtml += '<div class="ses-info-item">Session: <span>'+esc(truncId(sid,32))+'</span></div>';
      if (sb) {
        infoHtml += '<div class="ses-info-item">Sandbox: <span>'+esc(sb.name)+'</span></div>';
        infoHtml += '<div class="ses-info-item">Status: <span class="badge '+sb.status+'">'+sb.status+'</span></div>';
      }
      infoHtml += '</div>';
      document.getElementById('ses-info-bar').innerHTML = infoHtml;

      // Reset to events tab
      switchSubtab('events');
      refreshEvents();

      // Auto-refresh
      if (evAutoRefresh) clearInterval(evAutoRefresh);
      evAutoRefresh = setInterval(() => { if (currentSessionId === sid) refreshEvents(); }, 3000);
    }

    function switchSubtab(name) {
      document.querySelectorAll('.ses-subtab').forEach(t => t.classList.toggle('active', t.dataset.subtab === name));
      document.getElementById('subtab-events').style.display = name === 'events' ? 'flex' : 'none';
      document.getElementById('subtab-resources').style.display = name === 'resources' ? 'block' : 'none';
      if (name === 'resources') loadResources();
    }

    // === Event classification ===
    function classifyEvent(ev) {
      const type = (ev.type || '').toLowerCase();
      if (type.includes('error') || ev.error || ev.level === 'error') return 'error';
      if (type.includes('tool')) return 'tool';
      // Check content blocks for tool_use/tool_result (nested in agent.message)
      if (Array.isArray(ev.content)) {
        const hasToolBlock = ev.content.some(c => c.type === 'tool_use' || c.type === 'tool_result');
        if (hasToolBlock) return 'tool';
      }
      if (type.includes('user') || ev.role === 'user') return 'user';
      if (type.includes('agent') || type.includes('assistant') || ev.role === 'assistant') return 'agent';
      return 'system';
    }

    function getEventSummary(ev) {
      const cls = classifyEvent(ev);
      const type = ev.type || '';
      switch (cls) {
        case 'user': return extractText(ev).slice(0, 80) || 'user message';
        case 'agent': {
          const txt = extractText(ev);
          if (txt && txt.length > 2 && !txt.startsWith('{')) return txt.slice(0, 80);
          return type || 'agent response';
        }
        case 'tool': {
          // Direct tool event
          const name = ev.name || ev.tool_name || ev.content_block?.name || '';
          if (name) return (type.includes('result') ? 'result: ' : '') + name;
          // Nested in content blocks
          if (Array.isArray(ev.content)) {
            const toolBlock = ev.content.find(c => c.type === 'tool_use' || c.type === 'tool_result');
            if (toolBlock) return (toolBlock.type === 'tool_result' ? 'result: ' : '') + (toolBlock.name || 'tool');
          }
          return type || 'tool_use';
        }
        case 'error': return (ev.error?.message || ev.message || type).slice(0, 80);
        default: return type || 'event';
      }
    }

    // === Events ===
    async function refreshEvents() {
      if (!currentSessionId) return;
      try {
        const r = await fetch('/api/sessions/'+currentSessionId+'/events?limit=200');
        const events = await r.json();
        if (!Array.isArray(events)) { cachedEvents = []; renderEventList(); return; }
        cachedEvents = events;
        renderEventList();
        // Re-select if idx still valid
        if (selectedEventIdx >= 0 && selectedEventIdx < cachedEvents.length) {
          renderEventDetail(cachedEvents[selectedEventIdx]);
        }
      } catch(e) { cachedEvents = []; renderEventList(); }
    }

    function setEvFilter(filter) {
      evFilter = filter;
      document.querySelectorAll('.ev-filter-tab').forEach(t => t.classList.toggle('active', t.dataset.filter === filter));
      renderEventList();
    }

    function renderEventList() {
      const listEl = document.getElementById('ev-list');
      const filtered = evFilter === 'all' ? cachedEvents : cachedEvents.filter(ev => classifyEvent(ev) === evFilter);

      // Update counts
      document.getElementById('ev-total-count').textContent = cachedEvents.length + ' events' + (evFilter !== 'all' ? ' ('+filtered.length+' shown)' : '');

      if (filtered.length === 0) {
        listEl.innerHTML = '<div style="padding:16px;color:var(--muted);font-size:11px;text-align:center">'+(cachedEvents.length === 0 ? 'No events yet' : 'No '+evFilter+' events')+'</div>';
        return;
      }

      listEl.innerHTML = filtered.map((ev, i) => {
        const realIdx = cachedEvents.indexOf(ev);
        const cls = classifyEvent(ev);
        const summary = getEventSummary(ev);
        const ts = ev.created_at || ev.timestamp || '';
        const isSelected = realIdx === selectedEventIdx;
        return '<div class="ev-item'+(isSelected?' selected':'')+'" onclick="selectEvent('+realIdx+')">'
          +'<div class="ev-item-header">'
          +'<span class="ev-item-type '+cls+'">'+cls+'</span>'
          +'<span class="ev-item-ts">'+esc(ts ? fmtTime(ts) : '#'+(realIdx+1))+'</span>'
          +'</div>'
          +'<div class="ev-item-preview">'+esc(summary)+'</div>'
          +'</div>';
      }).join('');
    }

    function selectEvent(idx) {
      selectedEventIdx = idx;
      // Update list selection
      const items = document.querySelectorAll('.ev-item');
      items.forEach(el => el.classList.remove('selected'));
      // Find the clicked one — re-render is simpler
      renderEventList();
      if (idx >= 0 && idx < cachedEvents.length) {
        renderEventDetail(cachedEvents[idx]);
      }
    }

    // === Event detail rendering ===
    function setDetailMode(mode) {
      detailMode = mode;
      document.getElementById('ev-detail-preview').classList.toggle('active', mode === 'preview');
      document.getElementById('ev-detail-raw').classList.toggle('active', mode === 'raw');
      if (selectedEventIdx >= 0 && selectedEventIdx < cachedEvents.length) {
        renderEventDetail(cachedEvents[selectedEventIdx]);
      }
    }

    function renderEventDetail(ev) {
      document.getElementById('ev-detail-empty').style.display = 'none';
      const content = document.getElementById('ev-detail-content');
      content.style.display = 'block';

      const cls = classifyEvent(ev);
      const type = ev.type || 'unknown';
      document.getElementById('ev-detail-title').textContent = type + ' (#'+(selectedEventIdx+1)+')';

      if (detailMode === 'raw') {
        content.innerHTML = '<div class="ev-raw-block">'+esc(JSON.stringify(ev, null, 2))+'</div>';
        return;
      }

      // Preview mode — render based on classification
      let html = '';

      switch (cls) {
        case 'user': {
          const text = extractText(ev);
          html += '<div class="ev-bubble user">'+esc(text)+'</div>';
          break;
        }
        case 'agent': {
          const text = extractText(ev);
          if (text && text.length > 2 && !text.startsWith('{')) {
            html += '<div class="ev-bubble agent md-content">'+renderMd(text)+'</div>';
          } else {
            html += '<div class="ev-raw-block">'+esc(JSON.stringify(ev, null, 2))+'</div>';
          }
          break;
        }
        case 'tool': {
          // Could be a direct tool event OR an agent.message with tool content blocks
          if (Array.isArray(ev.content)) {
            const toolBlocks = ev.content.filter(c => c.type === 'tool_use' || c.type === 'tool_result');
            if (toolBlocks.length > 0) {
              toolBlocks.forEach(block => {
                const isResult = block.type === 'tool_result';
                const name = block.name || block.tool_name || 'tool';
                html += '<div class="ev-tool-section">';
                html += '<div class="ev-tool-name" style="color:'+(isResult?'var(--purple)':'var(--orange)')+'">'+(isResult?'Result':'Tool')+': '+esc(name)+'</div>';
                const body = isResult ? (block.content || block.output || '') : (block.input || '');
                const text = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
                html += '<div class="ev-tool-body">'+esc(text.slice(0,3000))+'</div>';
                html += '</div>';
              });
              break;
            }
          }
          // Direct tool event
          const name = ev.name || ev.tool_name || ev.content_block?.name || 'tool';
          const isResult = type.includes('result');
          html += '<div class="ev-tool-section">';
          html += '<div class="ev-tool-name" style="color:'+(isResult?'var(--purple)':'var(--orange)')+'">'+(isResult?'Result':'Tool')+': '+esc(name)+'</div>';
          if (isResult) {
            const body = ev.content || ev.output || '';
            const text = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
            html += '<div class="ev-tool-body">'+esc(text.slice(0,3000))+'</div>';
          } else {
            const input = ev.input || ev.content_block?.input || ev.content?.[0]?.input || '';
            const text = typeof input === 'string' ? input : JSON.stringify(input, null, 2);
            html += '<div class="ev-tool-body">'+esc(text)+'</div>';
          }
          html += '</div>';
          break;
        }
        case 'error': {
          const msg = ev.error?.message || ev.message || JSON.stringify(ev);
          html += '<div class="ev-bubble" style="background:#3d1f1f;color:var(--red)">'+esc(msg)+'</div>';
          if (ev.error?.code) html += '<div style="margin-top:6px;font-size:10px;color:var(--muted)">Code: '+esc(ev.error.code)+'</div>';
          break;
        }
        default: {
          html += '<div class="ev-raw-block">'+esc(JSON.stringify(ev, null, 2))+'</div>';
        }
      }

      // Metadata footer
      html += '<dl class="ev-detail-meta">';
      if (ev.id) html += '<dt>ID:</dt><dd>'+esc(ev.id)+'</dd>';
      if (ev.type) html += '<dt>Type:</dt><dd>'+esc(ev.type)+'</dd>';
      if (ev.created_at) html += '<dt>Time:</dt><dd>'+esc(new Date(ev.created_at).toLocaleString())+'</dd>';
      if (ev.model) html += '<dt>Model:</dt><dd>'+esc(ev.model)+'</dd>';
      html += '</dl>';

      content.innerHTML = html;
    }

    function extractText(ev) {
      if (ev.text) return ev.text;
      if (ev.content) {
        if (typeof ev.content === 'string') return ev.content;
        if (Array.isArray(ev.content)) {
          return ev.content.filter(c => c.type === 'text').map(c => c.text || '').join('\\n') || JSON.stringify(ev.content);
        }
      }
      if (ev.message?.content) return extractText(ev.message);
      return JSON.stringify(ev).slice(0, 300);
    }

    // === Resources ===
    async function loadResources() {
      const panel = document.getElementById('subtab-resources');
      panel.innerHTML = '<div style="padding:16px;color:var(--muted);font-size:11px">Loading...</div>';

      let sessionData = null;
      let sandboxData = null;
      let agentData = null;

      try {
        const r = await fetch('/api/sessions/'+currentSessionId);
        sessionData = await r.json();
      } catch {}

      // Fetch full agent details if agent id available
      const agentId = sessionData?.agent?.id || (typeof sessionData?.agent === 'string' ? sessionData.agent : null);
      if (agentId) {
        try {
          const r2 = await fetch('/api/agents/'+agentId);
          agentData = await r2.json();
          if (agentData.error) agentData = null;
        } catch {}
      }

      sandboxData = cachedSandboxes.filter(s => s.sessionId === currentSessionId);

      let html = '';

      // Session Info
      html += '<div class="res-section"><div class="res-section-title">Session</div>';
      if (sessionData && !sessionData.error) {
        html += '<div class="res-card"><dl>';
        html += '<dt>ID</dt><dd>'+esc(sessionData.id || currentSessionId)+'</dd>';
        if (sessionData.agent) html += '<dt>Agent</dt><dd>'+esc(sessionData.agent.name || sessionData.agent.id || JSON.stringify(sessionData.agent))+'</dd>';
        if (sessionData.agent?.model) html += '<dt>Model</dt><dd><span class="badge" style="background:#1a3a5c;color:var(--cyan)">'+esc(sessionData.agent.model.id || sessionData.agent.model)+'</span>'+(sessionData.agent.model.speed ? ' <span class="badge" style="background:#2d1b4e;color:var(--purple)">'+esc(sessionData.agent.model.speed)+'</span>':'')+'</dd>';
        if (sessionData.status) html += '<dt>Status</dt><dd>'+esc(sessionData.status)+'</dd>';
        if (sessionData.created_at) html += '<dt>Created</dt><dd>'+esc(new Date(sessionData.created_at).toLocaleString())+'</dd>';
        if (sessionData.stats) {
          if (sessionData.stats.duration_seconds != null) html += '<dt>Duration</dt><dd>'+sessionData.stats.duration_seconds+'s</dd>';
        }
        if (sessionData.usage) {
          html += '<dt>Tokens</dt><dd>in: '+(sessionData.usage.input_tokens||0)+' / out: '+(sessionData.usage.output_tokens||0)+'</dd>';
        }
        html += '</dl></div>';
      } else {
        html += '<div class="res-empty">Session metadata unavailable</div>';
      }
      html += '</div>';

      // Agent Details (from full agent fetch)
      html += '<div class="res-section"><div class="res-section-title">Agent Configuration</div>';
      if (agentData) {
        html += '<div class="res-card"><dl>';
        html += '<dt>Agent ID</dt><dd>'+esc(agentData.id)+'</dd>';
        if (agentData.name) html += '<dt>Name</dt><dd>'+esc(agentData.name)+'</dd>';
        if (agentData.description) html += '<dt>Description</dt><dd>'+esc(agentData.description)+'</dd>';
        if (agentData.model) html += '<dt>Model</dt><dd><span class="badge" style="background:#1a3a5c;color:var(--cyan)">'+esc(agentData.model.id)+'</span>'+(agentData.model.speed ? ' <span class="badge" style="background:#2d1b4e;color:var(--purple)">'+esc(agentData.model.speed)+'</span>':'')+'</dd>';
        if (agentData.version != null) html += '<dt>Version</dt><dd>v'+agentData.version+'</dd>';
        if (agentData.system) html += '<dt>System Prompt</dt><dd style="max-height:120px;overflow-y:auto;white-space:pre-wrap;font-size:10px;background:var(--bg);padding:6px;border-radius:4px;margin-top:4px">'+esc(agentData.system.slice(0, 2000))+(agentData.system.length > 2000 ? '\\n... (truncated)' : '')+'</dd>';
        // Multiagent
        if (agentData.multiagent) {
          html += '<dt>Multi-Agent</dt><dd><span class="badge" style="background:#2d3a1b;color:var(--green)">'+esc(agentData.multiagent.type || 'coordinator')+'</span>';
          if (agentData.multiagent.agents && agentData.multiagent.agents.length > 0) {
            html += ' ('+agentData.multiagent.agents.length+' sub-agents)';
          }
          html += '</dd>';
        }
        html += '</dl></div>';

        // Tools
        const tools = agentData.tools || [];
        if (tools.length > 0) {
          html += '<div class="res-card" style="margin-top:8px"><div style="font-size:10px;color:var(--muted);margin-bottom:6px;text-transform:uppercase">Tools ('+tools.length+')</div>';
          html += '<div style="display:flex;flex-wrap:wrap;gap:4px">';
          for (const t of tools) {
            const name = t.name || t.type || (typeof t === 'string' ? t : JSON.stringify(t));
            const ttype = t.type || '';
            const color = ttype === 'computer_20250124' ? 'var(--orange)' : ttype === 'bash_20250124' ? 'var(--green)' : ttype === 'text_editor_20250124' ? 'var(--purple)' : 'var(--cyan)';
            html += '<span class="badge" style="background:rgba(255,255,255,0.05);color:'+color+';font-size:10px">'+esc(name)+'</span>';
          }
          html += '</div></div>';
        }

        // Skills
        const skills = agentData.skills || [];
        if (skills.length > 0) {
          html += '<div class="res-card" style="margin-top:8px"><div style="font-size:10px;color:var(--muted);margin-bottom:6px;text-transform:uppercase">Skills ('+skills.length+')</div>';
          html += '<div style="display:flex;flex-wrap:wrap;gap:4px">';
          for (const s of skills) {
            const name = s.name || s.type || (typeof s === 'string' ? s : JSON.stringify(s));
            html += '<span class="badge" style="background:rgba(255,255,255,0.05);color:var(--yellow);font-size:10px">'+esc(name)+'</span>';
          }
          html += '</div></div>';
        }

        // MCP Servers
        const mcpServers = agentData.mcp_servers || [];
        if (mcpServers.length > 0) {
          html += '<div class="res-card" style="margin-top:8px"><div style="font-size:10px;color:var(--muted);margin-bottom:6px;text-transform:uppercase">MCP Servers ('+mcpServers.length+')</div>';
          html += '<dl>';
          for (const m of mcpServers) {
            html += '<dt>'+esc(m.name || 'unnamed')+'</dt><dd>'+esc(m.url || m.uri || JSON.stringify(m))+'</dd>';
          }
          html += '</dl></div>';
        }

        // Sub-Agents (multiagent roster)
        if (agentData.multiagent && agentData.multiagent.agents && agentData.multiagent.agents.length > 0) {
          html += '<div class="res-card" style="margin-top:8px"><div style="font-size:10px;color:var(--muted);margin-bottom:6px;text-transform:uppercase">Sub-Agents</div>';
          html += '<dl>';
          for (const sa of agentData.multiagent.agents) {
            html += '<dt>'+esc(sa.name || sa.id || 'unnamed')+'</dt><dd>'+esc(sa.model?.id || sa.model || '?')+'</dd>';
          }
          html += '</dl></div>';
        }
      } else if (agentId) {
        html += '<div class="res-empty">Could not fetch agent details for '+esc(agentId)+'</div>';
      } else {
        html += '<div class="res-empty">No agent associated with this session</div>';
      }
      html += '</div>';

      // Sandbox(es) for this session
      html += '<div class="res-section"><div class="res-section-title">Sandboxes</div>';
      if (sandboxData.length > 0) {
        for (const sb of sandboxData) {
          html += '<div class="res-card"><dl>';
          html += '<dt>Name</dt><dd>'+esc(sb.name)+'</dd>';
          html += '<dt>Status</dt><dd><span class="badge '+sb.status+'">'+sb.status+'</span></dd>';
          html += '<dt>Work ID</dt><dd>'+esc(truncId(sb.workId, 32))+'</dd>';
          if (sb.pid) html += '<dt>PID</dt><dd>'+sb.pid+'</dd>';
          html += '<dt>Created</dt><dd>'+fmtTime(sb.createdAt)+'</dd>';
          if (sb.exitedAt) html += '<dt>Exited</dt><dd>'+fmtTime(sb.exitedAt)+'</dd>';
          if (sb.exitCode != null) html += '<dt>Exit Code</dt><dd style="color:'+(sb.exitCode===0?'var(--green)':'var(--red)')+'">'+sb.exitCode+'</dd>';
          html += '</dl></div>';
        }
      } else {
        html += '<div class="res-empty">No sandboxes recorded for this session</div>';
      }
      html += '</div>';

      // MCP Resources / Files / Memory (session-level)
      html += '<div class="res-section"><div class="res-section-title">Session Resources & Memory</div>';
      const resources = sessionData?.resources || [];
      const memory = sessionData?.memory || null;
      if (Array.isArray(resources) && resources.length > 0) {
        html += '<div class="res-card"><dl>';
        for (const r of resources) {
          const name = typeof r === 'string' ? r : (r.name || r.uri || JSON.stringify(r));
          html += '<dt>Resource</dt><dd>'+esc(name)+'</dd>';
        }
        html += '</dl></div>';
      } else if (memory) {
        html += '<div class="res-card"><dl>';
        html += '<dt>Memory</dt><dd>'+esc(typeof memory === 'string' ? memory : JSON.stringify(memory))+'</dd>';
        html += '</dl></div>';
      } else {
        html += '<div class="res-empty">No mounted resources or memory stores</div>';
      }
      html += '</div>';

      // Raw session JSON (collapsible)
      if (sessionData && !sessionData.error) {
        html += '<div class="res-section"><div class="res-section-title" style="cursor:pointer" onclick="document.getElementById(\\'res-raw-session\\').style.display=document.getElementById(\\'res-raw-session\\').style.display===\\'none\\'?\\'block\\':\\'none\\'">Raw Session Data ▸</div>';
        html += '<div id="res-raw-session" style="display:none"><div class="res-card" style="max-height:400px;overflow-y:auto"><pre style="font-size:10px;white-space:pre-wrap;word-break:break-word">'+esc(JSON.stringify(sessionData, null, 2))+'</pre></div></div></div>';
      }

      panel.innerHTML = html;
    }

    // === Agents Panel ===
    const AGENT_YAML_TEMPLATE = \`name: my-agent
model: claude-sonnet-4-6
description: A helpful coding assistant
system: |
  You are a helpful assistant with access to tools.
  Be concise and accurate.
tools:
  - type: agent_toolset_20260401
mcp_servers: []
skills: []
\`;

    let agentEditorVisible = false;
    let agentEditorMode = 'create'; // 'create' or 'edit'
    let editingAgentId = null;
    let editingAgentVersion = null;

    async function loadAgentsPanel() {
      const panel = document.getElementById('agents-panel');
      panel.innerHTML = '<div style="padding:16px;color:var(--muted);font-size:11px">Loading agents...</div>';

      if (cachedAgents.length === 0) await loadAgents();

      let html = '<div style="padding:12px">';
      // Toolbar
      html += '<div style="display:flex;gap:8px;margin-bottom:12px;align-items:center">';
      html += '<button class="btn primary" onclick="openAgentEditor(\\'create\\')">+ Create Agent</button>';
      html += '<button class="btn" onclick="loadAgentsPanel()">Refresh</button>';
      html += '<span style="font-size:11px;color:var(--muted)">'+cachedAgents.length+' agent(s)</span>';
      html += '</div>';

      // YAML Editor panel (create or edit mode)
      const editorTitle = agentEditorMode === 'edit'
        ? 'Edit Agent <span style="color:var(--muted);font-size:10px;font-weight:normal">('+esc(editingAgentId)+' v'+editingAgentVersion+')</span>'
        : 'Create Agent from YAML';
      html += '<div id="agent-editor-panel" style="display:'+(agentEditorVisible?'block':'none')+';margin-bottom:16px;border:1px solid var(--border);border-radius:6px;padding:12px;background:var(--bg2)">';
      html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">';
      html += '<span style="font-weight:600;font-size:12px;color:var(--blue)">'+editorTitle+'</span>';
      html += '<div style="display:flex;gap:6px">';
      if (agentEditorMode === 'create') {
        html += '<button class="btn" onclick="fillAgentTemplate()" style="font-size:10px">Template</button>';
      }
      html += '<button class="btn" onclick="validateAgentYaml()" style="font-size:10px;color:var(--yellow)">Validate</button>';
      if (agentEditorMode === 'edit') {
        html += '<button class="btn primary" onclick="submitUpdateAgent()" style="font-size:10px">Save</button>';
      } else {
        html += '<button class="btn primary" onclick="submitCreateAgent()" style="font-size:10px">Create</button>';
      }
      html += '<button class="btn" onclick="closeAgentEditor()" style="font-size:10px;color:var(--muted)">Cancel</button>';
      html += '</div></div>';
      html += '<textarea id="agent-yaml-input" spellcheck="false" style="width:100%;height:280px;background:var(--bg);color:var(--text);border:1px solid var(--border);border-radius:4px;padding:8px;font-family:inherit;font-size:11px;resize:vertical;tab-size:2">'+(document.getElementById('agent-yaml-input')?.value || '')+'</textarea>';
      html += '<div id="agent-editor-feedback" style="margin-top:8px;font-size:11px"></div>';
      html += '</div>';

      // Agent cards
      if (cachedAgents.length === 0) {
        html += '<div style="color:var(--muted);font-size:11px">No agents found in this environment.</div>';
      } else {
        html += '<div style="display:flex;flex-wrap:wrap;gap:12px">';
        for (const agent of cachedAgents) {
          html += renderAgentCard(agent);
        }
        html += '</div>';
      }
      html += '</div>';
      panel.innerHTML = html;
    }

    function renderAgentCard(agent) {
        const modelId = agent.model?.id || '?';
        const modelShort = modelId.replace('claude-', '').replace('-20250514', '');
        const speed = agent.model?.speed || '';
        const toolCount = (agent.tools || []).length;
        const skillCount = (agent.skills || []).length;
        const mcpCount = (agent.mcp_servers || []).length;
        const isMulti = !!agent.multiagent;
        const subCount = isMulti ? (agent.multiagent.agents || []).length : 0;

        let html = '<div class="res-card" style="min-width:260px;max-width:360px;flex:1">';
        html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">';
        html += '<span style="font-weight:600;color:var(--blue);font-size:12px">'+esc(agent.name || agent.id)+'</span>';
        if (isMulti) html += '<span class="badge" style="background:#2d3a1b;color:var(--green);font-size:9px">coordinator ('+subCount+')</span>';
        html += '</div>';
        if (agent.description) html += '<div style="font-size:10px;color:var(--muted);margin-bottom:6px">'+esc(agent.description)+'</div>';
        html += '<dl style="font-size:11px">';
        html += '<dt>Model</dt><dd><span class="badge" style="background:#1a3a5c;color:var(--cyan)">'+esc(modelShort)+'</span>'+(speed ? ' <span class="badge" style="background:#2d1b4e;color:var(--purple)">'+esc(speed)+'</span>' : '')+'</dd>';
        html += '<dt>ID</dt><dd style="font-size:10px;color:var(--muted)">'+esc(agent.id)+'</dd>';
        if (agent.version != null) html += '<dt>Version</dt><dd>v'+agent.version+'</dd>';
        html += '<dt>Tools</dt><dd>'+toolCount+(toolCount > 0 ? ' <span style="color:var(--muted);font-size:10px">('+((agent.tools||[]).map(t=>t.name||t.type||'?').slice(0,5).join(', '))+(toolCount>5?'...':'')+')</span>' : '')+'</dd>';
        html += '<dt>Skills</dt><dd>'+skillCount+'</dd>';
        if (mcpCount > 0) html += '<dt>MCP</dt><dd>'+mcpCount+'</dd>';
        html += '</dl>';
        if (isMulti && agent.multiagent.agents) {
          html += '<div style="margin-top:6px;font-size:10px;color:var(--muted);text-transform:uppercase">Sub-Agents</div>';
          html += '<div style="display:flex;flex-wrap:wrap;gap:3px;margin-top:3px">';
          for (const sa of agent.multiagent.agents) {
            html += '<span class="badge" style="background:rgba(255,255,255,0.05);color:var(--green);font-size:9px">'+esc(sa.name || sa.id || '?')+'</span>';
          }
          html += '</div>';
        }
        html += '<div style="margin-top:8px;border-top:1px solid var(--border);padding-top:6px;display:flex;gap:6px">';
        html += '<button class="btn" onclick="editAgent(\\''+esc(agent.id)+'\\')" style="font-size:10px">Edit</button>';
        html += '</div>';
        html += '</div>';
        return html;
    }

    function openAgentEditor(mode, yamlContent) {
      agentEditorMode = mode;
      agentEditorVisible = true;
      if (mode === 'create') { editingAgentId = null; editingAgentVersion = null; }
      // Re-render panel to update editor state
      loadAgentsPanel().then(() => {
        if (yamlContent) {
          const ta = document.getElementById('agent-yaml-input');
          if (ta) ta.value = yamlContent;
        }
      });
    }

    function closeAgentEditor() {
      agentEditorVisible = false;
      agentEditorMode = 'create';
      editingAgentId = null;
      editingAgentVersion = null;
      loadAgentsPanel();
    }

    async function editAgent(agentId) {
      const fb = document.getElementById('agent-editor-feedback');
      // Fetch YAML representation from server
      agentEditorMode = 'edit';
      agentEditorVisible = true;
      editingAgentId = agentId;
      editingAgentVersion = null;
      // Re-render to show editor in loading state
      const panel = document.getElementById('agents-panel');
      if (panel) {
        // Quick inline loading render
        await loadAgentsPanel();
      }
      const ta = document.getElementById('agent-yaml-input');
      const feedback = document.getElementById('agent-editor-feedback');
      if (ta) ta.value = '# Loading...';
      try {
        const r = await fetch('/api/agents/'+encodeURIComponent(agentId)+'/yaml');
        const res = await r.json();
        if (res.error) { if (feedback) feedback.innerHTML = '<span style="color:var(--red)">'+esc(res.error)+'</span>'; return; }
        editingAgentVersion = res.version;
        if (ta) ta.value = res.yaml;
        // Re-render to show version in title
        await loadAgentsPanel();
        // Restore yaml content after re-render
        const ta2 = document.getElementById('agent-yaml-input');
        if (ta2) ta2.value = res.yaml;
      } catch(e) { if (feedback) feedback.innerHTML = '<span style="color:var(--red)">Failed to load: '+esc(e.message)+'</span>'; }
    }

    function fillAgentTemplate() {
      const ta = document.getElementById('agent-yaml-input');
      if (ta) ta.value = AGENT_YAML_TEMPLATE;
      const fb = document.getElementById('agent-editor-feedback');
      if (fb) fb.innerHTML = '';
    }

    async function validateAgentYaml() {
      const ta = document.getElementById('agent-yaml-input');
      const fb = document.getElementById('agent-editor-feedback');
      const yaml = (ta?.value || '').trim();
      if (!yaml) { fb.innerHTML = '<span style="color:var(--red)">YAML is empty</span>'; return; }
      fb.innerHTML = '<span style="color:var(--muted)">Validating...</span>';
      try {
        const r = await fetch('/api/agents/validate', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({yaml})});
        const res = await r.json();
        if (res.valid) {
          fb.innerHTML = '<span style="color:var(--green)">\\u2713 Valid YAML — ready to submit</span>';
        } else {
          fb.innerHTML = '<span style="color:var(--red)">Validation errors:</span><ul style="margin:4px 0 0 16px;color:var(--red);font-size:10px">' + (res.errors||[]).map(e => '<li>'+esc(e)+'</li>').join('') + '</ul>';
        }
      } catch(e) { fb.innerHTML = '<span style="color:var(--red)">Request failed: '+esc(e.message)+'</span>'; }
    }

    async function submitCreateAgent() {
      const ta = document.getElementById('agent-yaml-input');
      const fb = document.getElementById('agent-editor-feedback');
      const yaml = (ta?.value || '').trim();
      if (!yaml) { fb.innerHTML = '<span style="color:var(--red)">YAML is empty</span>'; return; }
      fb.innerHTML = '<span style="color:var(--muted)">Creating agent...</span>';
      try {
        const r = await fetch('/api/agents', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({yaml})});
        const res = await r.json();
        if (res.error) {
          const errList = res.errors ? '<ul style="margin:4px 0 0 16px;font-size:10px">' + res.errors.map(e => '<li>'+esc(e)+'</li>').join('') + '</ul>' : '';
          fb.innerHTML = '<span style="color:var(--red)">'+esc(res.error)+'</span>' + errList;
          return;
        }
        fb.innerHTML = '<span style="color:var(--green)">\\u2713 Agent created: '+esc(res.name || res.id)+'</span>';
        cachedAgents = [];
        setTimeout(() => { closeAgentEditor(); }, 800);
      } catch(e) { fb.innerHTML = '<span style="color:var(--red)">Request failed: '+esc(e.message)+'</span>'; }
    }

    async function submitUpdateAgent() {
      const ta = document.getElementById('agent-yaml-input');
      const fb = document.getElementById('agent-editor-feedback');
      const yaml = (ta?.value || '').trim();
      if (!yaml) { fb.innerHTML = '<span style="color:var(--red)">YAML is empty</span>'; return; }
      if (!editingAgentId || editingAgentVersion == null) { fb.innerHTML = '<span style="color:var(--red)">No agent selected for edit</span>'; return; }
      fb.innerHTML = '<span style="color:var(--muted)">Saving...</span>';
      try {
        const r = await fetch('/api/agents/'+encodeURIComponent(editingAgentId), {method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({yaml, version: editingAgentVersion})});
        const res = await r.json();
        if (res.error) {
          const errList = res.errors ? '<ul style="margin:4px 0 0 16px;font-size:10px">' + res.errors.map(e => '<li>'+esc(e)+'</li>').join('') + '</ul>' : '';
          fb.innerHTML = '<span style="color:var(--red)">'+esc(res.error)+'</span>' + errList;
          return;
        }
        fb.innerHTML = '<span style="color:var(--green)">\\u2713 Agent updated: '+esc(res.name || res.id)+' (v'+res.version+')</span>';
        cachedAgents = [];
        setTimeout(() => { closeAgentEditor(); }, 800);
      } catch(e) { fb.innerHTML = '<span style="color:var(--red)">Request failed: '+esc(e.message)+'</span>'; }
    }

    // === Session create / send ===
    async function doSendMessage() {
      if (!currentSessionId) return;
      const input = document.getElementById('ses-send-input');
      const msg = input.value.trim();
      if (!msg) return;
      input.value = '';
      try {
        const r = await fetch('/api/sessions/'+currentSessionId+'/events', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:msg})});
        const res = await r.json();
        if (res.error) throw new Error(res.error);
        setTimeout(refreshEvents, 500);
      } catch(e) { alert('Send failed: '+e.message); }
    }

    function showCreateSession() {
      document.getElementById('ses-empty').style.display = 'none';
      document.getElementById('ses-detail').style.display = 'none';
      document.getElementById('ses-create-form').style.display = 'block';
      document.getElementById('ses-create-result').innerHTML = '';
    }
    function hideCreateSession() {
      document.getElementById('ses-create-form').style.display = 'none';
      if (currentSessionId) {
        document.getElementById('ses-detail').style.display = 'flex';
      } else {
        document.getElementById('ses-empty').style.display = 'flex';
      }
    }

    async function doCreateSession() {
      const agent = document.getElementById('ses-create-agent').value.trim();
      const msg = document.getElementById('ses-create-msg').value.trim();
      const resultEl = document.getElementById('ses-create-result');
      if (!agent) { resultEl.innerHTML = '<span style="color:var(--red)">Agent ID required</span>'; return; }
      resultEl.innerHTML = '<span style="color:var(--muted)">Creating...</span>';
      try {
        const r = await fetch('/api/sessions', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({agent, message: msg || undefined})});
        const session = await r.json();
        if (session.error) throw new Error(session.error);
        // Register in local known sessions so sidebar shows it immediately
        knownSessions.set(session.id, { sessionId: session.id, name: agent, status: 'created', createdAt: Date.now() });
        resultEl.innerHTML = '<span style="color:var(--green)">Created: '+esc(session.id)+'</span>';
        setTimeout(() => {
          hideCreateSession();
          refreshSessionList();
          selectSessionById(session.id);
        }, 500);
      } catch(e) { resultEl.innerHTML = '<span style="color:var(--red)">Error: '+esc(e.message)+'</span>'; }
    }

    // Navigate to session from sandbox card
    function viewSessionFromSandbox(sid) {
      document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(x => x.classList.remove('active'));
      document.querySelector('[data-tab="sessions"]').classList.add('active');
      document.getElementById('tab-sessions').classList.add('active');
      refreshSessionList();
      selectSessionById(sid);
    }

    // ========================
    // SANDBOXES
    // ========================
    async function refreshSandboxes() {
      const grid = document.getElementById('sandbox-grid');
      try {
        const r = await fetch('/api/sandboxes');
        const list = await r.json();
        cachedSandboxes = list;
        const statsEl = document.getElementById('sb-stats');
        const running = list.filter(s => s.status==='running'||s.status==='spawning').length;
        statsEl.textContent = running + ' running / ' + list.length + ' total';
        grid.innerHTML = list.map(s => renderSandboxCard(s)).join('');
      } catch(e) { grid.innerHTML = '<p style="color:var(--red);padding:16px">Error: '+esc(String(e))+'</p>'; }
    }

    function renderSandboxCard(s) {
      const duration = s.exitedAt ? fmtDuration(s.exitedAt - s.createdAt) : (s.status === 'running' ? fmtDuration(Date.now() - s.createdAt) : '-');
      const exitCodeColor = s.exitCode === 0 ? 'var(--green)' : (s.exitCode != null ? 'var(--red)' : 'var(--muted)');

      let html = '<div class="card">';
      html += '<div class="card-header"><h3>'+esc(s.name)+'</h3><span class="badge '+s.status+'">'+s.status+'</span></div>';
      html += '<dl class="card-meta">';
      html += '<dt>Session</dt><dd title="'+esc(s.sessionId)+'">'+esc(truncId(s.sessionId, 28))+'</dd>';
      html += '<dt>Work ID</dt><dd title="'+esc(s.workId)+'">'+esc(truncId(s.workId, 28))+'</dd>';
      if (s.pid) html += '<dt>PID</dt><dd>'+s.pid+'</dd>';
      html += '<dt>Created</dt><dd>'+fmtTime(s.createdAt)+'</dd>';
      if (s.exitedAt) html += '<dt>Exited</dt><dd>'+fmtTime(s.exitedAt)+'</dd>';
      html += '<dt>Duration</dt><dd>'+duration+'</dd>';
      if (s.exitCode != null) html += '<dt>Exit Code</dt><dd style="color:'+exitCodeColor+'">'+s.exitCode+'</dd>';
      html += '</dl>';

      if (s.stdout) {
        const stdoutId = 'so-'+s.id;
        html += '<div class="card-section"><div class="card-section-header" onclick="document.getElementById(\\''+stdoutId+'\\').classList.toggle(\\'open\\')">&gt; stdout ('+s.stdout.length+' bytes)</div>';
        html += '<div class="card-section-body" id="'+stdoutId+'">'+esc(s.stdout)+'</div></div>';
      }
      if (s.stderr) {
        const stderrId = 'se-'+s.id;
        html += '<div class="card-section"><div class="card-section-header" style="color:var(--red)" onclick="document.getElementById(\\''+stderrId+'\\').classList.toggle(\\'open\\')">&gt; stderr ('+s.stderr.length+' bytes)</div>';
        html += '<div class="card-section-body" id="'+stderrId+'" style="border-color:var(--red)">'+esc(s.stderr)+'</div></div>';
      }

      html += '<div class="card-actions"><button class="btn sm" onclick="viewSessionFromSandbox(\\''+esc(s.sessionId)+'\\')">View Session</button>';
      if (s.status === 'exited' || s.status === 'failed') {
        html += '<button class="btn sm" style="color:var(--red)" onclick="dismissSandbox(\\''+esc(s.id)+'\\')">Dismiss</button>';
      }
      html += '</div>';
      html += '</div>';
      return html;
    }

    async function clearExitedSandboxes() {
      try {
        const r = await fetch('/api/sandboxes/exited', {method:'DELETE'});
        const res = await r.json();
        if (res.error) throw new Error(res.error);
        refreshSandboxes();
      } catch(e) { alert('Clear failed: '+e.message); }
    }

    async function dismissSandbox(id) {
      try {
        const r = await fetch('/api/sandboxes/'+id, {method:'DELETE'});
        const res = await r.json();
        if (res.error) throw new Error(res.error);
        refreshSandboxes();
      } catch(e) { alert('Dismiss failed: '+e.message); }
    }

    // Initial load
    loadAgents();
    refreshSessionList();
  </script>
</body>
</html>`;
