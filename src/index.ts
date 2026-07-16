/**
 * chorograph public API — assemble a {@link Graph} from any TypeScript project, or bring your own
 * {@link Provider}. Everything here is language-agnostic except {@link createTypeScriptProvider}.
 *
 * @chorograph group="Core" role=usecase comms=in-proc
 */
export * from "./core/model.ts";
export { parseAnnotation, type ParsedAnnotation, ANNOTATION_TAGS } from "./core/annotations.ts";
export { assemble, type AssembleOptions } from "./core/graph.ts";
export { createTypeScriptProvider } from "./providers/typescript.ts";

import { assemble } from "./core/graph.ts";
import type { Graph, Provider } from "./core/model.ts";
import { createTypeScriptProvider } from "./providers/typescript.ts";

export interface ScanOptions {
  /** Honour `@chorograph`/`@archmap` annotations (currently the only node source). Default true. */
  readonly annotations?: boolean;
  readonly onWarn?: (msg: string) => void;
  readonly provider?: Provider;
  readonly version?: string;
}

/** Scan a directory and return the assembled architecture graph. */
export async function scan(root: string, opts: ScanOptions = {}): Promise<Graph> {
  const provider = opts.provider ?? createTypeScriptProvider();
  const result = await provider.scan(root, {
    annotations: opts.annotations ?? true,
    onWarn: opts.onWarn ?? (() => {}),
  });
  return assemble(result, {
    root,
    provider: provider.name,
    version: opts.version ?? "0.1.0",
  });
}
