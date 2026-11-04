"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { StatusNote, Tag } from "@/components/ui";
import { classNames } from "@/lib/format";
import { DEMONSTRATION_LABEL, type ModelStatus } from "@/lib/model/status";
import { sendQuestion } from "@/lib/professor/client";
import { QUESTION_LIMIT, type ContextPack, type Conversation, type ConversationSummary, type ProfessorMessage } from "@/lib/professor/types";
import { ContextDrawer, portfolioTag } from "./context-drawer";

const starters = [
  "Where is my book concentrated?",
  "How should I think about my watchlist?",
  "How does my book compare with the S&P 500?",
  "How should I read the sample briefs?",
];

export type RequestedConversation = { id: string; status: "not-found" | "error" } | null;

type Props = {
  conversations: ConversationSummary[] | null;
  initial: Conversation | null;
  requested: RequestedConversation;
  context: ContextPack;
  model: ModelStatus;
  saving: boolean;
};

export function ProfessorWorkspace({ conversations, initial, requested, context: initialContext, model, saving }: Props) {
  const [conversation, setConversation] = useState<Conversation | null>(initial);
  const [list, setList] = useState<ConversationSummary[]>(conversations ?? []);
  const [context, setContext] = useState(initialContext);
  const [question, setQuestion] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [denied, setDenied] = useState(requested);
  const transcriptEnd = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);

  const messages = conversation?.messages ?? [];
  const count = messages.length;

  useEffect(() => {
    if (count > 0 || pending) transcriptEnd.current?.scrollIntoView({ block: "nearest" });
  }, [count, pending]);

  async function ask(text: string) {
    const trimmed = text.trim();
    if (!trimmed || pending || !saving) return;
    if (trimmed.length > QUESTION_LIMIT) {
      setError(`Keep the question under ${QUESTION_LIMIT} characters.`);
      return;
    }
    setPending(trimmed);
    setError(null);
    const result = await sendQuestion(conversation?.id ?? null, trimmed);
    setPending(null);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    const saved = result.conversation;
    setConversation(saved);
    setContext(result.context);
    setQuestion("");
    setList((current) => [{ id: saved.id, title: saved.title, updatedAt: new Date().toISOString() }, ...current.filter((item) => item.id !== saved.id)]);
    if (!conversation) window.history.replaceState(null, "", `/professor?c=${saved.id}`);
    composer.current?.focus();
  }

  function startNew() {
    setConversation(null);
    setDenied(null);
    setError(null);
    setQuestion("");
    window.history.replaceState(null, "", "/professor");
    composer.current?.focus();
  }

  return (
    <div>
      <header className="flex flex-wrap items-end justify-between gap-x-10 gap-y-5">
        <div className="max-w-[660px]">
          <p className="text-sm text-quiet">A study partner for your own book</p>
          <h1 className="serif mt-1 text-[40px] leading-none text-forest md:text-[48px]">Professor</h1>
          <p className="mt-4 flex flex-wrap items-center gap-2 text-sm leading-6 text-quiet" data-testid="professor-honesty">
            <ModelTag model={model} />
            <span>
              {model === "demonstration"
                ? "No model is connected. Replies are rule-based demonstration text built from your own book, not a model call."
                : "A model key is set, but no model provider is connected in this build, so replies are unavailable."}
            </span>
          </p>
        </div>
        <button type="button" className="v-btn quiet" onClick={() => setDrawer(true)} aria-haspopup="dialog" aria-expanded={drawer} data-testid="open-context">
          Context
          {portfolioTag(context.portfolio)}
        </button>
      </header>

      <div className="mt-10 grid gap-x-12 gap-y-10 lg:grid-cols-[220px_minmax(0,1fr)]">
        <section aria-labelledby="transcript-heading" className="min-w-0 lg:order-2">
          {denied ? (
            <div className="mb-8" data-testid="conversation-denied">
              <StatusNote
                kind={denied.status === "error" ? "error" : "unavailable"}
                title={denied.status === "error" ? "That conversation could not be loaded" : "This conversation is not available"}
                body={
                  denied.status === "error"
                    ? "The conversation service did not respond. Try again."
                    : "It does not exist or belongs to another student. Saved conversations are private to the student who started them."
                }
                compact
              />
            </div>
          ) : null}

          <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-rule pb-4">
            <h2 id="transcript-heading" className="serif text-2xl leading-snug text-forest" data-testid="conversation-title">
              {conversation?.title ?? "New conversation"}
            </h2>
            {conversation ? <span className="text-[13px] text-quiet">Saved to your account</span> : null}
          </div>

          <ol className="mt-6 space-y-6" aria-live="polite" aria-label="Transcript" data-testid="transcript">
            {messages.length === 0 && !pending ? (
              <li className="text-[15px] leading-7 text-quiet">
                Ask about your own book, your watchlist, or the competition rules. The Professor cannot place, fill, or cancel an order.
              </li>
            ) : null}
            {messages.map((message) => (
              <MessageRow key={message.id} message={message} />
            ))}
            {pending ? (
              <>
                <MessageRow message={{ id: -1, role: "student", body: pending, replyStatus: null }} />
                <li role="status" className="border-l-2 border-pale pl-4 text-sm text-quiet" data-state="loading">
                  Preparing a reply from your context…
                </li>
              </>
            ) : null}
          </ol>
          <div ref={transcriptEnd} />

          {messages.length === 0 && !pending ? (
            <div className="mt-6 flex flex-wrap gap-2" aria-label="Suggested questions">
              {starters.map((starter) => (
                <button key={starter} type="button" className="v-btn quiet small" onClick={() => ask(starter)} disabled={!saving || pending !== null}>
                  {starter}
                </button>
              ))}
            </div>
          ) : null}

          {error ? (
            <p role="alert" className="mt-6 rounded-xl border border-[#efd2cc] bg-loss-soft px-4 py-3 text-sm text-loss">{error}</p>
          ) : null}

          {saving ? (
            <form
              className="mt-8 rounded-2xl border border-rule bg-paper p-3 focus-within:border-sage"
              onSubmit={(event) => {
                event.preventDefault();
                ask(question);
              }}
            >
              <label htmlFor="professor-question" className="sr-only">
                {conversation ? "Follow-up question" : "Question for the Professor"}
              </label>
              <textarea
                id="professor-question"
                ref={composer}
                className="block w-full resize-none border-0 bg-transparent px-2 py-1.5 text-[15px] leading-6 text-ink outline-none placeholder:text-quiet"
                rows={3}
                maxLength={QUESTION_LIMIT}
                value={question}
                placeholder={conversation ? "Ask a follow-up" : "Ask about your book"}
                onChange={(event) => setQuestion(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                    event.preventDefault();
                    ask(question);
                  }
                }}
              />
              <div className="mt-2 flex items-center justify-between gap-3 px-2">
                <span className="text-[12px] text-quiet">
                  {question.length}/{QUESTION_LIMIT} · Enter to send, Shift+Enter for a new line
                </span>
                <button type="submit" className="v-btn small" disabled={pending !== null || question.trim().length === 0}>
                  {pending ? "Sending…" : "Send"}
                </button>
              </div>
            </form>
          ) : (
            <div className="mt-8">
              <StatusNote
                kind="unavailable"
                compact
                title="Saved conversations are unavailable"
                body="The server cannot record conversations in this environment, so the composer is off. Nothing was sent."
              />
            </div>
          )}
        </section>

        <nav aria-labelledby="conversations-heading" className="lg:order-1">
          <div className="flex items-center justify-between gap-3">
            <h2 id="conversations-heading" className="text-sm font-medium text-forest">Conversations</h2>
            <button type="button" className="text-[13px] text-primary underline-offset-4 hover:underline disabled:text-quiet disabled:no-underline" onClick={startNew} disabled={pending !== null}>
              New<span className="sr-only"> conversation</span>
            </button>
          </div>
          {conversations === null ? (
            <p className="mt-3 text-[13px] leading-5 text-quiet">Saved conversations could not be loaded.</p>
          ) : list.length === 0 ? (
            <p className="mt-3 text-[13px] leading-5 text-quiet">Nothing saved yet. Your first question starts a conversation.</p>
          ) : (
            <ul className="mt-3 divide-y divide-rule border-y border-rule" data-testid="conversation-list">
              {list.map((item) => {
                const active = item.id === conversation?.id;
                return (
                  <li key={item.id}>
                    <Link
                      href={`/professor?c=${item.id}`}
                      className={classNames("block py-2.5 text-[14px] leading-5 underline-offset-4 hover:underline", active ? "font-medium text-deep" : "text-forest")}
                      aria-current={active ? "page" : undefined}
                    >
                      <span className="line-clamp-2">{item.title}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </nav>
      </div>

      {drawer ? <ContextDrawer context={context} model={model} onClose={() => setDrawer(false)} /> : null}
    </div>
  );
}

function ModelTag({ model }: { model: ModelStatus }) {
  return model === "demonstration" ? <Tag kind="sample">Demonstration</Tag> : <Tag kind="unavailable">Model unavailable</Tag>;
}

function MessageRow({ message }: { message: ProfessorMessage }) {
  if (message.role === "student") {
    return (
      <li className="flex justify-end" data-role="student">
        <div className="max-w-[560px] rounded-2xl rounded-br-md bg-wash px-4 py-3 text-[15px] leading-6 text-ink">
          <span className="sr-only">You: </span>
          <p className="whitespace-pre-wrap">{message.body}</p>
        </div>
      </li>
    );
  }
  return (
    <li className="max-w-[680px] border-l-2 border-pale pl-4" data-role="professor" data-reply-status={message.replyStatus ?? undefined}>
      <p className="flex flex-wrap items-center gap-2 text-[13px] text-quiet">
        <span className="font-medium text-forest">Professor</span>
        {message.replyStatus === "unavailable" ? <Tag kind="unavailable">Unavailable</Tag> : <Tag kind="sample">{DEMONSTRATION_LABEL}</Tag>}
      </p>
      <p className="mt-2 whitespace-pre-wrap text-[15px] leading-7 text-ink">{message.body}</p>
    </li>
  );
}
