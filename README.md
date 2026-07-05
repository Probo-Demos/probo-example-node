# Probo Example: NodeJS

A standalone **Node.js / Express** demo that displays the environment variables a
Probo CI build injects into a container. It renders two tables:

- **Build variables** — the documented Probo catalog (`PROBO_ENVIRONMENT`,
  `BUILD_ID`, `BRANCH_NAME`, …) with live values where present.
- **Secrets & other injected variables** — everything else Probo made visible to
  the process (organization/project secrets and any custom variables),
  discovered dynamically.

The Node images run the application process directly (nginx only reverse-proxies to
`127.0.0.1:3000` — see `probo-ubuntu/nodejs/files/proxy-enable.conf`), so the app
inherits the full container environment and simply filters out the
Node/runtime plumbing (`NODE_*`, `NVM_*`, `npm_*`, `PATH`, `HOME`, …) so only the
injected variables remain.

## Project layout

```
.probo.yaml            Probo build config (nodejs type + NodeJSApp plugin step)
src/app.js             Express app: env filtering + two-table page render
src/package.json       Dependencies (express) and start scripts
```

## Run locally

```bash
cd src
npm install
npm start
# then open http://localhost:3000
```

Simulate a Probo build environment:

```bash
cd src
PROBO_ENVIRONMENT=TRUE BUILD_ID=abc123 BRANCH_NAME=main \
  DEMO_CUSTOM_VAR=hello MY_API_TOKEN=example npm start
```

## How it runs in a Probo Node.js container

`.probo.yaml` uses `type: nodejs` with `nodejs: 22` (which selects the
`proboci/ubuntu:nodejs22` image) and the built-in **NodeJSApp** plugin:

```yaml
type: nodejs
nodejs: 22

steps:
  - name: Setup NodeJS Application
    plugin: NodeJSApp
    subDirectory: src
    buildCommand: npm install
    runCommand: pm2 start npm -- run prod
    environment:
      NODE_ENV: production
      DEMO_CUSTOM_VAR: hello-from-probo-yaml
```

The NodeJSApp plugin (`probo/lib/plugins/TaskRunner/NodeJSApp.js`):

1. **Installs at build time** — runs `buildCommand` (`npm install`) in
   `$SRC_DIR/src`.
2. **Writes `/src/startup.sh`** — `cd /src/src; NODE_ENV="production"
   DEMO_CUSTOM_VAR="hello-from-probo-yaml" pm2 start npm -- run prod` (an
   `environment:` block is what makes the plugin generate this file).
3. **Starts the app under `pm2`** so the process is supervised and the build step
   returns instead of hanging. nginx reverse-proxies `*.probo.build` to the app
   on `127.0.0.1:3000`, so `app.js` listens on port 3000.

Any variable listed under `environment:` is passed to the app; custom ones such
as `DEMO_CUSTOM_VAR` appear in the page's second table. Standard Probo build
variables are passed automatically and populate the first table.

> **Why `pm2`?** The `pm2` package is preinstalled on every NodeJSApp container.
> Without it the build step can hang on a foreground process and never finish,
> and the "View Site" button won't light up. Always wrap your run command in
> `pm2` (e.g. `pm2 start npm -- run prod`).

See the full plugin reference at <https://www.probo.ci/docs/nodejs/>.
