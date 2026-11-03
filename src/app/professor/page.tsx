"use client";

import { useState } from "react";
import { Pill } from "@/components/ui";
import { contextFromBook, professorReply } from "@/lib/ai";
import { usePortfolio } from "@/lib/portfolio-state";
import { seasonMeta } from "@/lib/sample-data";

const prompts = [
  "Where is this portfolio concentrated?",
  "How does the book compare with the S&P sample?",
  "Should I buy more of the top holding?",
  "How should I read the sample headlines?",
];

type Message = { role: "user" | "professor"; text: string };

export default function ProfessorPage() {
  const { book, seasonReturn } = usePortfolio();
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "professor",
      text: "I am the demonstration professor. I can discuss your sample book, the published methodology, and the curated briefs. I cannot see private competitor holdings, place trades, or promise a return.",
    },
  ]);

  function ask(question: string) {
    const trimmed = question.trim();
    if (!trimmed) return;
    const context = contextFromBook("Maya Chen", book, seasonReturn, seasonMeta.benchmarkReturn);
    setMessages((current) => [
      ...current,
      { role: "user", text: trimmed },
      { role: "professor", text: professorReply(trimmed, context) },
    ]);
    setInput("");
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.08em] text-muted">Academic assistant</div>
          <h1 className="serif text-4xl text-forest">AI Professor</h1>
        </div>
        <Pill tone="warn">Demonstration · no model API configured</Pill>
      </div>
      <div className="card flex min-h-[460px] flex-col p-4">
        <div className="flex-1 space-y-3">
          {messages.map((message, index) => (
            <div key={`${message.role}-${index}`} className={message.role === "user" ? "ml-8 rounded-lg bg-mint px-3 py-2 text-sm" : "mr-8 rounded-lg border border-line px-3 py-2 text-sm leading-6"}>
              <div className="mb-1 text-[11px] uppercase tracking-[0.08em] text-muted">{message.role === "user" ? "You" : "Professor"}</div>
              {message.text}
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {prompts.map((prompt) => (
            <button key={prompt} className="btn secondary" type="button" onClick={() => ask(prompt)}>{prompt}</button>
          ))}
        </div>
        <form className="mt-3 flex gap-2" onSubmit={(event) => { event.preventDefault(); ask(input); }}>
          <input className="field" value={input} onChange={(event) => setInput(event.target.value)} placeholder="Ask about the sample portfolio" aria-label="Question for the professor" />
          <button className="btn" type="submit">Send</button>
        </form>
      </div>
      <p className="text-xs leading-5 text-muted">Educational decision support only. Replies name the sample timestamp and do not execute orders. A production integration would use a server-built context pack and would still refuse to trade.</p>
    </div>
  );
}
