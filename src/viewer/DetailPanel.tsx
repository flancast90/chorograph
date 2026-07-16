/**
 * Persistent detail panel for the selected node.
 *
 * @chorograph group="Viewer" role=component comms=in-proc
 */
import type { GraphIndex } from "./index-graph.ts";
import { roleColor, theme } from "./theme.ts";

interface Props {
  index: GraphIndex;
  selected: string | null;
  onNavigate: (id: string) => void;
  onClose: () => void;
}

export function DetailPanel({ index, selected, onNavigate, onClose }: Props) {
  if (!selected) return null;
  const node = index.byId.get(selected);
  if (!node) return null;

  const parent = node.parent ? index.byId.get(node.parent) : null;
  const inbound = index.inbound.get(selected) ?? [];
  const outbound = index.outbound.get(selected) ?? [];
  const dead =
    index.deprecated.has(selected) || node.status === "deprecated"
      ? "deprecated"
      : index.orphan.has(selected)
        ? "orphan"
        : index.unreachable.has(selected)
          ? "unreachable"
          : null;

  return (
    <aside
      data-ui
      style={{
        position: "absolute",
        top: 12,
        right: 12,
        width: 320,
        maxHeight: "calc(100% - 24px)",
        overflow: "auto",
        background: theme.panel,
        border: `1px solid ${theme.border}`,
        borderRadius: theme.radius,
        fontFamily: theme.fontSans,
        color: theme.text,
        zIndex: 2,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 8,
          padding: "12px 14px",
          borderBottom: `1px solid ${theme.border}`,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, wordBreak: "break-word" }}>{node.label}</div>
          <div style={{ fontFamily: theme.fontMono, fontSize: 11, color: theme.textMuted, marginTop: 4 }}>
            {node.containment}
            {dead ? ` · ${dead}` : ""}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          style={{
            background: "transparent",
            border: "none",
            color: theme.textFaint,
            cursor: "pointer",
            fontSize: 16,
            lineHeight: 1,
            padding: 4,
          }}
          aria-label="Close"
        >
          ×
        </button>
      </div>

      <Block label="id">
        <Mono>{node.id}</Mono>
      </Block>

      {parent && (
        <Block label="parent">
          <Link onClick={() => onNavigate(parent.id)}>{parent.label}</Link>
          <span style={{ color: theme.textFaint, marginLeft: 6, fontFamily: theme.fontMono, fontSize: 11 }}>
            {parent.containment}
          </span>
        </Block>
      )}

      {node.group && (
        <Block label="group">
          <Mono>{node.group}</Mono>
        </Block>
      )}

      {node.roles.length > 0 && (
        <Block label="roles">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {node.roles.map((r) => (
              <span
                key={r}
                style={{
                  fontFamily: theme.fontMono,
                  fontSize: 11,
                  color: theme.text,
                  border: `1px solid ${theme.border}`,
                  borderRadius: theme.radius,
                  padding: "2px 6px",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <span style={{ width: 6, height: 6, background: roleColor(r) }} />
                {r}
              </span>
            ))}
          </div>
        </Block>
      )}

      {node.comms.length > 0 && (
        <Block label="comms">
          <Mono>{node.comms.join(", ")}</Mono>
        </Block>
      )}

      <Block label="status">
        <span style={{ color: dead === "deprecated" ? theme.warning : theme.text }}>{node.status}</span>
      </Block>

      {(node.file || node.line) && (
        <Block label="source">
          <Mono>
            {node.file ?? "?"}
            {node.line != null ? `:${node.line}` : ""}
          </Mono>
        </Block>
      )}

      {node.description && (
        <Block label="description">
          <div style={{ fontSize: 12, lineHeight: 1.45, color: theme.textMuted }}>{node.description}</div>
        </Block>
      )}

      <EdgeList title={`outbound · ${outbound.length}`} edges={outbound} end="to" index={index} onNavigate={onNavigate} />
      <EdgeList title={`inbound · ${inbound.length}`} edges={inbound} end="from" index={index} onNavigate={onNavigate} />
    </aside>
  );
}

function EdgeList({
  title,
  edges,
  end,
  index,
  onNavigate,
}: {
  title: string;
  edges: readonly { id: string; from: string; to: string; comms: string; weight: number }[];
  end: "from" | "to";
  index: GraphIndex;
  onNavigate: (id: string) => void;
}) {
  if (edges.length === 0) return null;
  return (
    <div style={{ padding: "10px 14px", borderTop: `1px solid ${theme.border}` }}>
      <div
        style={{
          fontSize: 10,
          color: theme.textFaint,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          marginBottom: 8,
        }}
      >
        {title}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 180, overflow: "auto" }}>
        {edges.slice(0, 50).map((e) => {
          const id = end === "to" ? e.to : e.from;
          const n = index.byId.get(id);
          return (
            <button
              key={e.id}
              type="button"
              onClick={() => onNavigate(id)}
              style={{
                display: "flex",
                gap: 8,
                alignItems: "baseline",
                background: "transparent",
                border: "none",
                color: theme.text,
                cursor: "pointer",
                padding: "3px 0",
                fontSize: 12,
                textAlign: "left",
              }}
            >
              <span style={{ fontFamily: theme.fontMono, fontSize: 10, color: theme.textFaint, minWidth: 52 }}>
                {e.comms}
                {e.weight > 1 ? `×${e.weight}` : ""}
              </span>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {n?.label ?? id}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Block({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: "8px 14px" }}>
      <div
        style={{
          fontSize: 10,
          color: theme.textFaint,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

function Mono({ children }: { children: React.ReactNode }) {
  return <div style={{ fontFamily: theme.fontMono, fontSize: 11, color: theme.textMuted, wordBreak: "break-all" }}>{children}</div>;
}

function Link({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: "none",
        border: "none",
        color: theme.accent,
        cursor: "pointer",
        padding: 0,
        fontSize: 12,
        fontFamily: theme.fontSans,
      }}
    >
      {children}
    </button>
  );
}
