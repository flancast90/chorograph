/**
 * Dev server — serve the generated report over HTTP and re-scan on request, so `file://` CDN/security
 * quirks never bite and large maps can be refreshed without regenerating by hand.
 *
 * @chorograph group="CLI" role=service comms=http root
 */
import { createReadStream, existsSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join } from "node:path";

interface ServeOptions {
  readonly root: string;
  readonly outDir: string;
  readonly port: number;
  readonly version: string;
  readonly log: (msg: string) => void;
}

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
};

export async function serve(opts: ServeOptions): Promise<void> {
  const server = createServer((req, res) => {
    const url = (req.url ?? "/").split("?")[0] ?? "/";
    const file = url === "/" ? "report.html" : url.replace(/^\//, "");
    const path = join(opts.outDir, file);
    if (!existsSync(path) || !path.startsWith(opts.outDir)) {
      res.writeHead(404);
      res.end("not found");
      return;
    }
    res.writeHead(200, { "content-type": MIME[extname(path)] ?? "application/octet-stream" });
    createReadStream(path).pipe(res);
  });
  await new Promise<void>((r) => server.listen(opts.port, r));
  opts.log(`  serving → http://localhost:${opts.port}`);
  opts.log("  (Ctrl-C to stop)");
  await new Promise<never>(() => {});
}
