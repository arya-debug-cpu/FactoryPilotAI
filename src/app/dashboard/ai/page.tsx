"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, Sparkles, Trash2 } from "lucide-react";
import {
  Badge,
  EmptyState,
  ErrorState,
  Eyebrow,
  Loading,
  StatusDot,
} from "@/components/ui";
import { apiGet, apiPost, useApi } from "@/lib/api";
import { useQueryParam } from "@/lib/useQuery";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  mode?: string;
  sources?: string[];
  pending?: boolean;
};

type HistoryPayload = {
  messages: { id: number; role: string; content: string; mode: string; created_at: string }[];
};

type Insight = {
  category: string;
  severity: string;
  title: string;
  body: string;
  action: string;
};

const SUGGESTIONS = [
  "Which machines are currently at risk?",
  "Why is production below target?",
  "Which machine should be inspected first?",
  "What caused today's production drop?",
  "Which machine has the highest failure probability?",
  "Which machines are consuming excessive energy?",
  "What maintenance should be prioritized?",
  "What is causing the current production bottleneck?",
  "Which orders are at risk of missing their deadline?",
];

const SESSION_ID = "dashboard-session";

export default function AiAssistantPage() {
  const initial = useQueryParam("q");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sentInitial = useRef(false);
  const bottom = useRef<HTMLDivElement>(null);

  const { data: insights } = useApi<{ insights: Insight[] }>("/ai/insights");

  useEffect(() => {
    apiGet<HistoryPayload>(`/ai/history?session_id=${SESSION_ID}`)
      .then((payload) => {
        setMessages(
          payload.messages.map((m) => ({
            id: String(m.id),
            role: m.role as "user" | "assistant",
            content: m.content,
            mode: m.mode,
          })),
        );
      })
      .catch(() => {
        /* history is optional */
      });
  }, []);

  useEffect(() => {
    if (!initial || sentInitial.current) return;
    sentInitial.current = true;
    setInput(initial);
    void ask(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, sending]);

  async function ask(question: string) {
    const text = question.trim();
    if (!text || sending) return;
    setError(null);
    setSending(true);
    setInput("");
    const optimisticId = `local-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      { id: optimisticId, role: "user", content: text },
      { id: `${optimisticId}-a`, role: "assistant", content: "", pending: true },
    ]);

    try {
      const result = await apiPost<{ reply: string; mode: string; sources: string[] }>(
        "/ai/chat",
        { message: text, session_id: SESSION_ID },
      );
      setMessages((prev) =>
        prev.map((message) =>
          message.id === `${optimisticId}-a`
            ? { ...message, content: result.reply, mode: result.mode, sources: result.sources, pending: false }
            : message,
        ),
      );
    } catch (err) {
      const detail = err instanceof Error ? err.message : "The assistant could not be reached";
      setError(detail);
      setMessages((prev) => prev.filter((message) => message.id !== `${optimisticId}-a`));
    } finally {
      setSending(false);
    }
  }

  function clear() {
    setMessages([]);
    setError(null);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Eyebrow>Grounded in live plant data</Eyebrow>
          <h2 className="mt-2 text-[26px] font-semibold leading-tight tracking-[-0.02em] text-fg">
            AI Assistant
          </h2>
          <p className="mt-1 max-w-2xl text-[13px] text-muted">
            The backend classifies your question, retrieves the relevant records from PostgreSQL,
            attaches the current prediction results and generates the answer. It never invents
            machine data — if the data is insufficient, it says so.
          </p>
        </div>
        <button
          onClick={clear}
          className="inline-flex items-center gap-2 border border-line px-3 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-muted transition hover:border-signal hover:text-led"
        >
          <Trash2 className="h-3.5 w-3.5" /> Clear
        </button>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        {/* --------------------------------------------------- chat ------- */}
        <div className="flex min-h-[560px] flex-col border border-line bg-panel xl:col-span-2">
          <header className="flex items-center justify-between border-b border-line px-4 py-3">
            <div className="flex items-center gap-2.5">
              <StatusDot size={7} pulse />
              <span className="engrave text-muted">FactoryPilot AI · operations analyst</span>
            </div>
            <Badge tone="neutral">session {SESSION_ID}</Badge>
          </header>

          <div className="flex-1 space-y-5 overflow-y-auto p-4" style={{ maxHeight: 560 }}>
            {messages.length === 0 && !sending && (
              <div className="space-y-4">
                <EmptyState
                  title="Ask anything about the plant"
                  hint="Questions are answered from the live database — machines, production, orders, maintenance, energy and alerts."
                />
                <div className="flex flex-wrap gap-2">
                  {SUGGESTIONS.slice(0, 5).map((prompt) => (
                    <button
                      key={prompt}
                      onClick={() => void ask(prompt)}
                      className="border border-line bg-ink px-3 py-2 text-left text-[13px] text-muted transition hover:border-signal hover:text-fg"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((message) =>
              message.role === "user" ? (
                <div key={message.id} className="flex justify-end">
                  <p className="max-w-[85%] border border-line bg-raised px-4 py-2.5 text-[14px] leading-relaxed text-fg">
                    {message.content}
                  </p>
                </div>
              ) : (
                <div key={message.id} className="border-l-2 border-signal pl-4">
                  <div className="mb-2 flex items-center gap-2">
                    <Sparkles className="h-3.5 w-3.5 text-led" />
                    <span className="engrave text-led">FactoryPilot AI</span>
                    {message.mode && (
                      <Badge tone="neutral">{message.mode === "llm" ? "model" : "data-grounded"}</Badge>
                    )}
                    {message.sources && message.sources.length > 0 && (
                      <span className="font-mono text-[10px] text-dim">{message.sources.join(" · ")}</span>
                    )}
                  </div>
                  {message.pending ? (
                    <Loading rows={3} label="Retrieving plant data" />
                  ) : (
                    <Answer text={message.content} />
                  )}
                </div>
              ),
            )}

            {error && <ErrorState message={error} onRetry={() => setError(null)} />}
            <div ref={bottom} />
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              void ask(input);
            }}
            className="border-t border-line p-3"
          >
            <div className="flex items-end gap-3 border border-line bg-ink px-3 py-2 focus-within:border-signal">
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void ask(input);
                  }
                }}
                rows={2}
                placeholder="e.g. Why is production below target?"
                className="min-h-[44px] flex-1 resize-none bg-transparent py-1.5 text-[14px] text-fg placeholder:text-dim focus:outline-none"
              />
              <button
                type="submit"
                disabled={sending || !input.trim()}
                className="mb-1 inline-flex h-9 w-9 shrink-0 items-center justify-center bg-signal text-ink transition hover:bg-led disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-led"
                aria-label="Send question"
              >
                <ArrowUp className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.14em] text-dim">
              Enter to send · Shift + Enter for a new line
            </p>
          </form>
        </div>

        {/* --------------------------------------------- suggestions ------- */}
        <div className="space-y-6">
          <div className="border border-line bg-panel">
            <header className="border-b border-line px-4 py-3">
              <h3 className="engrave text-muted">Suggested questions</h3>
            </header>
            <ul className="p-2">
              {SUGGESTIONS.map((prompt) => (
                <li key={prompt}>
                  <button
                    onClick={() => void ask(prompt)}
                    disabled={sending}
                    className="w-full px-3 py-2.5 text-left text-[13.5px] leading-snug text-muted transition hover:bg-raised hover:text-fg disabled:opacity-50 focus:outline-none focus-visible:bg-raised"
                  >
                    <span className="mr-2 font-mono text-[12px] text-signal">›</span>
                    {prompt}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="border border-line bg-panel">
            <header className="border-b border-line px-4 py-3">
              <h3 className="engrave text-muted">Current AI insights</h3>
              <p className="mt-1 text-xs text-dim">Same engine the assistant queries</p>
            </header>
            <ul className="space-y-px bg-line">
              {(insights?.insights ?? []).slice(0, 4).map((insight) => (
                <li key={insight.title} className="bg-panel p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="engrave text-dim">{insight.category}</span>
                    <Badge
                      tone={insight.severity === "Critical" ? "red" : insight.severity === "Warning" ? "amber" : "neutral"}
                    >
                      {insight.severity}
                    </Badge>
                  </div>
                  <p className="mt-2 text-[14px] font-semibold leading-snug text-fg">{insight.title}</p>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{insight.body}</p>
                </li>
              ))}
              {!insights && <li className="bg-panel p-4"><Loading rows={2} label="Loading insights" /></li>}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Renders the structured assistant answer (Situation / Evidence / ...). */
function Answer({ text }: { text: string }) {
  const lines = text.split("\n").filter((line) => line.trim().length > 0);
  return (
    <div className="space-y-2">
      {lines.map((line, index) => {
        const heading = /^(Situation|Evidence|Likely cause|Risk|Recommended action)\s*:/i.test(line);
        if (heading) {
          const [label, ...rest] = line.split(":");
          return (
            <p key={index} className="pt-2">
              <span className="engrave text-led">{label.trim()}:</span>{" "}
              <span className="text-[14px] leading-relaxed text-fg">{rest.join(":").trim()}</span>
            </p>
          );
        }
        if (/^[-•]\s?/.test(line)) {
          return (
            <p key={index} className="pl-4 text-[14px] leading-relaxed text-muted">
              <span className="mr-2 text-signal">—</span>
              {line.replace(/^[-•]\s?/, "")}
            </p>
          );
        }
        return (
          <p key={index} className="text-[14px] leading-relaxed text-fg">
            {line}
          </p>
        );
      })}
    </div>
  );
}
