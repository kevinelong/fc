# 05 · Build, render & environment

## File inventory (`/home/kevin/codeonline/tpos/`)
- `index.html` — public storefront prototype (single file: `CONFIG`, `TRAILERS[]`, filter/search/
  sort, deep-link detail modal, quote/sell forms posting to `/api/tpos/inquiry`).
- `app/` — 12 role-dashboard prototypes on shared mock data (`app/data.js` = `window.TPOS`),
  `app/app.css` design system, `app/{index,owner,leadgen,sales,salesmgr,pricing,inventory,service,
  office,bookkeeper,dispatch,customer,platform}.html`.
- `spec/` — the documents:
  - `spec.html` → `TPOS-Product-Specification.pdf` — **the requirements spec (DONE, v2.0)**.
  - `schema.sql` — PostgreSQL DDL (enums, tables, RLS policy loop, materialized KPI view). Belongs
    to the **Proposal**.
  - `openapi.yaml` — OpenAPI 3.1, 66 paths + outbound `webhooks` + non-JSON content types, validated. Belongs to the **Proposal**.
  - `asyncapi.yaml` — AsyncAPI 3.0 contract for the real-time event channel (SSE/WS), validated with @asyncapi/parser. Belongs to the **Proposal** (§4.1).
  - `decision-summary.html` → `TPOS-Decision-Summary.pdf` — older one-page architecture front-sheet.
  - **(to create)** `proposal.html` → `TPOS-Functional-Specification-Proposal.pdf`
  - **(to create)** `bid-delivery.html` → `TPOS-Bid-and-Delivery-Pack.pdf`
- `docs/` — this handoff. `_moved-architecture-appendices.html` and `_moved-bid-appendices.html`
  hold the raw HTML (with `.t` tables etc.) to lift into the two new docs.

## The HTML→PDF docs
Each is a **self-contained print-styled HTML** with an inline `<style>` (`@page { size: Letter }`,
`.t` tables, `.req` lists, `.wf` wireframe boxes, `.pill`, `.two` columns…) and an inline `<script>`
of **pure-SVG B&W diagram generators**. Shared SVG helpers: `ST,GR,LG,MG` colors; `r()` `rf()`
`tx()` `tl()` `cross()` `arrowR()`; plus `screen()` for role wireframes. Copy the `<style>` block +
helpers from `spec/spec.html` when creating `proposal.html` / `bid-delivery.html`.

**Diagram generators to recover from git** (`git show 4298694~1:tpos/spec/spec.html`) for the new
docs: `#isolation` (tenant-isolation defense-in-depth) and `#acctmap` (accounting canonical-model +
adapters) → Proposal; `#roadmap` (3-phase) and `#stages-dia` (stage-gates) → Bid pack.

## Rendering a PDF (headless Chromium via Playwright)
Working dir `/tmp/pw2` has `playwright-core` installed (NOT `playwright` — require
`'playwright-core'`). System Chromium at `/usr/bin/chromium-browser`. Pattern:
```js
const { chromium } = require('playwright-core');
(async()=>{
  const b=await chromium.launch({executablePath:'/usr/bin/chromium-browser',args:['--no-sandbox','--disable-gpu']});
  const p=await b.newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto('file:///home/kevin/codeonline/tpos/spec/<doc>.html',{waitUntil:'networkidle'});
  // verify diagram divs populated: document.getElementById('<id>').querySelector('svg')
  await p.pdf({path:'/home/kevin/codeonline/tpos/spec/<Doc>.pdf',preferCSSPageSize:true,printBackground:true});
  await b.close(); console.log('JS errors:', errs.length?errs:'none');
})();
```
Run with `cd /tmp/pw2 && node <script>.js`. **Always check `pageerror` is empty and that every
`#diagram` div contains an `<svg>` before committing.** Page count:
`python3 -c "import re;d=open('<pdf>','rb').read();print(len(re.findall(rb'/Type\s*/Page[^s]',d)))"`.

## Serving / verifying
nginx serves `/home/kevin/codeonline` as the web root → files are live at `https://codeonline.io/tpos/...`
with no deploy step. Verify: `curl -s -o /dev/null -w "%{http_code} %{content_type}\n"
https://codeonline.io/tpos/spec/<file>.pdf`.

## Git & safety
- Repo `/home/kevin/codeonline`, branch `main`. Commit footer:
  the current model’s co-author footer (now `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`).
- Never stage/commit `apid/.env`, `apid/data/`, `node_modules`, secrets.
- `apid` = the backend (Node `http`, no framework, 127.0.0.1:8092, nginx proxies `/api/`, flat
  JSON store, OpenRC service). The only live endpoint for TPOS is `/api/tpos/inquiry` (lead capture).
