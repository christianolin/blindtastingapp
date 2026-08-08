<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Claude API cost rules (owner mandate)

The `ANTHROPIC_API_KEY` in `.env.local` bills the owner's Anthropic API
account per token. It exists for ONE purpose: the app's own runtime features
(the label scanner users trigger in production).

- **NEVER run one-off batch or maintenance work through the Anthropic API**
  (no scripts that loop wines/notes/anything through `api.anthropic.com`).
  A 67-wine batch with web search cost ~$8 on 2026-08-07 — that must not
  recur.
- Batch content work (descriptions, price research, data cleanup) is done BY
  THE ASSISTANT IN-SESSION — reasoning, web research and writing happen under
  the Claude subscription this session runs on; scripts only read/write the
  database with the results.
- Before any work that would call the API programmatically at all, state the
  expected cost and get explicit approval first.
- Keep per-scan API cost minimal: vision extraction only, no server-side web
  search tools in interactive flows.
