'use strict';

// Probo build environment inspector.
//
// A small Express app that renders the environment variables a Probo CI build
// injects into the container. It mirrors the .NET `probo_test` demo but runs as
// a standalone Node.js application served through Probo's NodeJSApp plugin.
//
// nginx inside the Node container reverse-proxies *.probo.build to the app on
// 127.0.0.1:3000 (see probo-ubuntu/nodejs/files/proxy-enable.conf), so the app
// simply listens on port 3000 and inherits the container environment directly.

const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// Documented Probo build variables. Any present in the environment are shown
// (described) in the first table, in this order. See https://docs.probo.ci.
const KNOWN_VARIABLES = [
  ['PROBO_ENVIRONMENT', 'Set to <code>TRUE</code> when running inside a Probo build container.'],
  ['BUILD_ID', 'Unique identifier for the current build.'],
  ['BUILD_DOMAIN', "Domain where this build's site is accessible."],
  ['BRANCH_NAME', 'Name of the git branch being built.'],
  ['BRANCH_LINK', 'URL to the branch on the VCS provider (GitHub, Bitbucket, etc.).'],
  ['COMMIT_REF', 'Full commit hash/reference being built.'],
  ['COMMIT_LINK', 'URL to the commit on the VCS provider.'],
  ['PULL_REQUEST_NAME', 'Title of the pull request that triggered this build.'],
  ['PULL_REQUEST_LINK', 'URL to the pull request on the VCS provider.'],
  ['SRC_DIR', 'Path to the source code directory inside the container.'],
  ['ASSET_DIR', 'Path to the assets directory inside the container.'],
];

// Exact names that are container/shell/runtime plumbing rather than build
// input, so they are hidden from the second table.
const EXACT_EXCLUDE = new Set([
  'HOME', 'PATH', 'PWD', 'OLDPWD', 'SHLVL', 'TERM', 'LANG', 'LANGUAGE',
  'LC_ALL', 'LS_COLORS', 'HOSTNAME', 'USER', 'LOGNAME', 'MAIL', 'SHELL',
  '_', 'DEBIAN_FRONTEND', 'TZ', 'PORT',
]);

// Name prefixes owned by the Node/runtime toolchain, hidden from the page.
const PREFIX_EXCLUDE = ['NODE_', 'NVM_', 'npm_', 'PM2_', 'XDG_', 'LC_', 'SUDO_'];

function isExcluded(name) {
  if (EXACT_EXCLUDE.has(name)) {
    return true;
  }
  return PREFIX_EXCLUDE.some((prefix) => name.startsWith(prefix));
}

// The environment variables Probo made visible to the application, with
// runtime/system plumbing removed.
function visibleEnvironment() {
  const visible = {};
  for (const [name, value] of Object.entries(process.env)) {
    if (!name || isExcluded(name)) {
      continue;
    }
    visible[name] = value == null ? '' : value;
  }
  return visible;
}

// Partition the visible environment into the documented build-variable catalog
// (first table) and everything else Probo injected — secrets and custom vars
// (second table).
function snapshot() {
  const visible = visibleEnvironment();

  const buildVariables = KNOWN_VARIABLES.map(([name, description]) => {
    const present = Object.prototype.hasOwnProperty.call(visible, name);
    const value = present ? visible[name] : null;
    delete visible[name];
    return { name, value, present, description };
  });

  const otherVariables = Object.keys(visible)
    .sort()
    .map((name) => ({ name, value: visible[name] }));

  return { buildVariables, otherVariables };
}

// Minimal HTML escaping for values we render as text.
function esc(value) {
  if (value == null) {
    return '';
  }
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderPage() {
  const { buildVariables, otherVariables } = snapshot();
  const inProbo = process.env.PROBO_ENVIRONMENT === 'TRUE';
  const nodeVersion = process.version.replace(/^v/, '');
  const nodeMajor = nodeVersion.split('.')[0];

  const buildRows = buildVariables
    .map((row) => {
      const valueCell = row.present && row.value
        ? `<span class="var-value val-set">${esc(row.value)}</span>`
        : '<span class="var-value val-unset">not set</span>';
      return `
        <tr>
          <td><span class="var-name">$${esc(row.name)}</span></td>
          <td>${valueCell}</td>
          <td class="var-desc">${row.description}</td>
        </tr>`;
    })
    .join('');

  const otherSection = otherVariables.length === 0
    ? '<p class="var-value val-unset">No additional variables are exposed in this environment.</p>'
    : `
      <table class="env-table">
        <thead>
          <tr>
            <th style="width:35%">Variable</th>
            <th>Value</th>
          </tr>
        </thead>
        <tbody>
          ${otherVariables
            .map((row) => `
            <tr>
              <td><span class="var-name">$${esc(row.name)}</span></td>
              <td>${row.value
                ? `<span class="var-value val-set">${esc(row.value)}</span>`
                : '<span class="var-value val-unset">empty</span>'}</td>
            </tr>`)
            .join('')}
        </tbody>
      </table>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Probo Environment &mdash; Node.js Demo</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --bg:#0f1117; --surface:#1a1d27; --border:#2a2d3e;
      --accent:#3ecf8e; --accent2:#68d391; --text:#e2e4f0; --muted:#8b8fa8;
      --green:#3ecf8e; --yellow:#f5c542; --radius:12px;
    }
    body {
      font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
      background:var(--bg); color:var(--text); min-height:100vh;
      display:flex; flex-direction:column;
    }
    nav {
      display:flex; align-items:center; justify-content:space-between;
      padding:1rem 2rem; border-bottom:1px solid var(--border);
      backdrop-filter:blur(10px); position:sticky; top:0; z-index:100;
      background:rgba(15,17,23,0.85);
    }
    .logo {
      font-size:1.25rem; font-weight:700;
      background:linear-gradient(135deg,var(--accent),var(--accent2));
      -webkit-background-clip:text; -webkit-text-fill-color:transparent;
      background-clip:text; letter-spacing:-0.5px;
    }
    nav ul { list-style:none; display:flex; gap:2rem; }
    nav a { color:var(--muted); text-decoration:none; font-size:0.9rem; transition:color 0.2s; }
    nav a:hover { color:var(--text); }
    .hero { text-align:center; padding:5rem 2rem 3.5rem; position:relative; overflow:hidden; }
    .hero::before {
      content:""; position:absolute; inset:0;
      background:
        radial-gradient(ellipse 80% 50% at 50% -10%, rgba(62,207,142,0.25), transparent),
        radial-gradient(ellipse 60% 40% at 80% 80%, rgba(104,211,145,0.12), transparent);
      pointer-events:none;
    }
    .badge {
      display:inline-flex; align-items:center; gap:0.4rem;
      background:rgba(62,207,142,0.15); border:1px solid rgba(62,207,142,0.35);
      color:#7ee0b0; border-radius:999px; padding:0.3rem 0.9rem;
      font-size:0.78rem; font-weight:600; letter-spacing:0.5px;
      text-transform:uppercase; margin-bottom:1.5rem;
    }
    h1 { font-size:clamp(2rem,5vw,3.25rem); font-weight:800; line-height:1.1;
      letter-spacing:-1.5px; margin-bottom:1rem; }
    h1 span {
      background:linear-gradient(135deg,var(--accent),var(--accent2));
      -webkit-background-clip:text; -webkit-text-fill-color:transparent; background-clip:text;
    }
    .subtitle { font-size:1.05rem; color:var(--muted); max-width:540px; margin:0 auto; line-height:1.7; }
    .status-bar { display:flex; justify-content:center; padding:1.5rem 2rem 2.5rem; }
    .status-pill {
      display:inline-flex; align-items:center; gap:0.5rem; padding:0.5rem 1.25rem;
      border-radius:999px; font-size:0.85rem; font-weight:600;
    }
    .status-pill.active { background:rgba(62,207,142,0.15); border:1px solid rgba(62,207,142,0.4); color:var(--green); }
    .status-pill.inactive { background:rgba(245,197,66,0.12); border:1px solid rgba(245,197,66,0.35); color:var(--yellow); }
    .dot { width:8px; height:8px; border-radius:50%; background:currentColor; }
    .table-section { max-width:960px; margin:0 auto 5rem; padding:0 2rem; width:100%; }
    .section-title { font-size:1.4rem; font-weight:700; letter-spacing:-0.4px; margin-bottom:1.25rem; }
    .env-table { width:100%; border-collapse:collapse; font-size:0.9rem; }
    .env-table thead th {
      text-align:left; color:var(--muted); font-weight:600; font-size:0.75rem;
      text-transform:uppercase; letter-spacing:0.8px; padding:0.6rem 1rem;
      border-bottom:1px solid var(--border);
    }
    .env-table tbody tr { border-bottom:1px solid var(--border); transition:background 0.15s; }
    .env-table tbody tr:last-child { border-bottom:none; }
    .env-table tbody tr:hover { background:rgba(255,255,255,0.03); }
    .env-table td { padding:0.9rem 1rem; vertical-align:top; }
    .var-name { font-family:"SFMono-Regular",Consolas,Menlo,monospace; font-size:0.82rem; color:var(--accent2); white-space:nowrap; }
    .var-value { font-family:"SFMono-Regular",Consolas,Menlo,monospace; font-size:0.82rem; }
    .val-set { color:var(--green); word-break:break-all; }
    .val-unset { color:var(--muted); font-style:italic; }
    .var-desc { color:var(--muted); line-height:1.6; }
    .var-desc code { background:rgba(255,255,255,0.08); padding:1px 5px; border-radius:4px; font-size:0.8rem; font-family:"SFMono-Regular",Consolas,monospace; }
    .php-version-card { max-width:960px; margin:0 auto 2.5rem; padding:0 2rem; width:100%; }
    .php-version-inner {
      background:linear-gradient(135deg,rgba(62,207,142,0.15),rgba(104,211,145,0.1));
      border:1px solid rgba(62,207,142,0.4); border-radius:var(--radius);
      padding:1.75rem 2rem; display:flex; align-items:center; gap:1.5rem; flex-wrap:wrap;
    }
    .php-logo { font-size:2.5rem; line-height:1; flex-shrink:0; }
    .php-version-text { flex:1; min-width:160px; }
    .php-version-label { font-size:0.75rem; font-weight:600; text-transform:uppercase; letter-spacing:0.8px; color:var(--muted); margin-bottom:0.3rem; }
    .php-version-number {
      font-size:2.25rem; font-weight:800; letter-spacing:-1px;
      background:linear-gradient(135deg,var(--accent),var(--accent2));
      -webkit-background-clip:text; -webkit-text-fill-color:transparent; background-clip:text; line-height:1.1;
    }
    .php-version-full { font-size:0.82rem; color:var(--muted); margin-top:0.35rem; font-family:"SFMono-Regular",Consolas,Menlo,monospace; }
    footer { margin-top:auto; padding:2rem; text-align:center; color:var(--muted); font-size:0.82rem; border-top:1px solid var(--border); }
  </style>
</head>
<body>
  <nav>
    <span class="logo">Probo Demo</span>
    <ul>
      <li><a href="#env">Environment</a></li>
      <li><a href="https://docs.probo.ci" target="_blank" rel="noopener">Docs</a></li>
    </ul>
  </nav>

  <section class="hero">
    <div class="badge">&#x1F4E6; Probo CI &mdash; Node.js ${esc(nodeVersion)}</div>
    <h1>Build <span>environment</span> variables</h1>
    <p class="subtitle">
      Live values injected by Probo CI into this build container.
      Variables are populated when a pull request triggers a build.
    </p>
  </section>

  <div class="status-bar">
    <div class="status-pill ${inProbo ? 'active' : 'inactive'}">
      <span class="dot"></span>
      ${inProbo ? 'Running inside a Probo build container' : 'Not running in a Probo environment'}
    </div>
  </div>

  <div class="php-version-card">
    <div class="php-version-inner">
      <div class="php-logo">&#x1F49A;</div>
      <div class="php-version-text">
        <div class="php-version-label">Node.js Version</div>
        <div class="php-version-number">${esc(nodeVersion)}</div>
        <div class="php-version-full">Node.js ${esc(nodeVersion)} &middot; V8 ${esc(process.versions.v8)}</div>
      </div>
    </div>
  </div>

  <section class="table-section" id="env">
    <h2 class="section-title">Build variables</h2>
    <p class="var-desc" style="margin-bottom:1.25rem;">
      Documented variables Probo injects for every build. Values shown are read
      live from the process environment the Node.js application inherits inside
      the container.
    </p>
    <table class="env-table">
      <thead>
        <tr>
          <th style="width:22%">Variable</th>
          <th style="width:28%">Value</th>
          <th>Description</th>
        </tr>
      </thead>
      <tbody>${buildRows}
      </tbody>
    </table>
  </section>

  <section class="table-section" id="secrets">
    <h2 class="section-title">Secrets &amp; other injected variables</h2>
    <p class="var-desc" style="margin-bottom:1.25rem;">
      Everything else Probo made visible to the application: organization and
      project secrets plus any custom variables. Discovered dynamically from the
      container environment &mdash; there is no fixed list.
    </p>
    ${otherSection}
  </section>

  <footer>
    &copy; ${new Date().getFullYear()} Probo CI Demo &mdash; Node.js ${esc(nodeMajor)} &mdash; Built for preview environments.
  </footer>
</body>
</html>`;
}

app.get('/', (req, res) => {
  res.set('Content-Type', 'text/html; charset=utf-8').send(renderPage());
});

// Lightweight health check for the proxy / uptime probes.
app.get('/healthz', (req, res) => res.json({ status: 'ok', node: process.version }));

app.listen(PORT, () => {
  console.log(`Probo Node.js demo listening on port ${PORT}`);
});
