/**
 * Dev server — re-scan the annotated code and rebuild the map on every page load.
 *
 * Editing a comment and refreshing the browser is the whole loop; there is no cache to
 * invalidate and no websocket to babysit. Errors render as a plain page instead of killing
 * the server.
 */
import { createServer } from "node:http";
import { loadGraph } from "./load.ts";
import { renderReportHtml } from "./report.ts";

interface ServeOptions {
  readonly paths: readonly string[];
  readonly fallbackName: string;
  readonly port: number;
  readonly version: string;
  readonly log: (msg: string) => void;
}

const escapeHtml = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export async function serve(opts: ServeOptions): Promise<void> {
  const server = createServer((req, res) => {
    void (async () => {
      const url = (req.url ?? "/").split("?")[0];
      try {
        const graph = loadGraph(opts.paths, { version: opts.version, fallbackName: opts.fallbackName });
        if (url === "/graph.json") {
          res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
          res.end(JSON.stringify(graph, null, 2));
          return;
        }
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(await renderReportHtml(graph));
      } catch (e) {
        res.writeHead(500, { "content-type": "text/html; charset=utf-8" });
        res.end(
          `<body style="font: 13px ui-monospace, Menlo, monospace; padding: 2rem; color: #1b1f26; background: #f2f4f7">` +
            `<h2 style="font-size: 14px">the map failed to build</h2>` +
            `<pre style="white-space: pre-wrap">${escapeHtml(e instanceof Error ? (e.stack ?? e.message) : String(e))}</pre>` +
            `<p>fix the code and refresh.</p></body>`,
        );
      }
    })();
  });
  await new Promise<void>((r) => server.listen(opts.port, r));
  opts.log(`  serving → http://localhost:${opts.port}  (rebuilds on refresh, Ctrl-C to stop)`);
  await new Promise<never>(() => {});
}
