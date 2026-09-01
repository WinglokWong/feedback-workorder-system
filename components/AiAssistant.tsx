"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import type { AiTicketFilter } from "../lib/ai-types";

type Message = { role:"user"|"assistant"; content:string };
type Confirmation = { tool:"update_ticket_status"|"update_deployment_status"|"update_ticket_states"|"batch_update_ticket_status"|"batch_update_deployment_status"|"batch_update_ticket_states"; arguments:Record<string, unknown> };
type ResultContext = { ticketNumbers:string[] };
type AssistantResult = { message?:string; error?:string; confirmation?:Confirmation; pageFilter?:AiTicketFilter|null; resultContext?:ResultContext|null };

const welcome:Message = { role:"assistant", content:"你好，我可以帮你检索工单并直接更新首页列表，也可以修改单条或多条工单状态；批量操作只需统一确认一次。" };
const examples = ["查询今天的未部署工单", "查找星云实践平台的待处理工单", "工单100001现在是什么状态？"];

export default function AiAssistant({ onApplyFilter }:{ onApplyFilter:(filter:AiTicketFilter) => void }) {
  const router = useRouter();
  const messageBox = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([welcome]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Confirmation | null>(null);
  const [lastAction, setLastAction] = useState<Confirmation | null>(null);
  const [resultContext, setResultContext] = useState<ResultContext | null>(null);

  useEffect(() => { if (open) messageBox.current?.scrollTo({ top:messageBox.current.scrollHeight, behavior:"smooth" }); }, [messages, busy, open]);

  async function request(payload:Record<string, unknown>) {
    const response = await fetch("/api/assistant", { method:"POST", headers:{ "content-type":"application/json" }, body:JSON.stringify(payload) });
    const result = await response.json() as AssistantResult;
    if (!response.ok) throw new Error(result.error ?? "AI助手请求失败。");
    return result;
  }

  async function submit(event?:FormEvent<HTMLFormElement>, example?:string) {
    event?.preventDefault();
    const text = (example ?? input).trim();
    if (!text || busy || pending) return;
    const history = messages.slice(-8);
    setMessages((current) => [...current, { role:"user", content:text }]); setInput(""); setBusy(true);
    try {
      const result = await request({ message:text, history, recentAction:lastAction, resultContext });
      setMessages((current) => [...current, { role:"assistant", content:result.message ?? "请求已处理。" }]);
      if (result.pageFilter) onApplyFilter(result.pageFilter);
      if (result.resultContext) setResultContext(result.resultContext);
      setPending(result.confirmation ?? null);
    } catch (error) {
      setMessages((current) => [...current, { role:"assistant", content:error instanceof Error ? error.message : "AI助手暂时不可用。" }]);
    } finally { setBusy(false); }
  }

  async function confirm() {
    if (!pending || busy) return;
    const action = pending; setBusy(true);
    try {
      const result = await request({ confirmation:action });
      setMessages((current) => [...current, { role:"assistant", content:result.message ?? "操作已完成。" }]);
      setLastAction(action); setPending(null); router.refresh();
    } catch (error) {
      setMessages((current) => [...current, { role:"assistant", content:error instanceof Error ? error.message : "操作失败。" }]);
    } finally { setBusy(false); }
  }

  function cancel() { setPending(null); setMessages((current) => [...current, { role:"assistant", content:"已取消本次修改，没有变更任何工单。" }]); }
  function clearConversation() { setMessages([welcome]); setPending(null); setLastAction(null); setResultContext(null); setInput(""); }
  function handleKeyDown(event:KeyboardEvent<HTMLTextAreaElement>) { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }

  return <>
    <button className="ai-fab" type="button" aria-label={open ? "隐藏AI助手" : "打开AI助手"} aria-expanded={open} onClick={() => setOpen((current) => !current)}><span>AI</span><b>{open ? "隐藏助手" : "AI助手"}</b></button>
    {open && <aside className="ai-drawer" aria-label="AI工单助手">
      <header className="ai-drawer-header"><div><span>AI</span><strong>工单助手</strong></div><div><button type="button" onClick={clearConversation}>清空</button><button type="button" aria-label="关闭AI助手" onClick={() => setOpen(false)}>×</button></div></header>
      <section className="ai-assistant">
        <div className="ai-notice"><span>查询结果会同步筛选首页；多条工单可批量修改并统一确认一次。</span></div>
        <div className="ai-examples" aria-label="示例指令">{examples.map((example) => <button type="button" disabled={busy || Boolean(pending)} onClick={() => submit(undefined, example)} key={example}>{example}</button>)}</div>
        <div className="ai-messages" ref={messageBox} aria-live="polite">{messages.map((message, index) => <div className={`ai-message ai-message-${message.role}`} key={`${message.role}-${index}`}><span>{message.role === "user" ? "你" : "AI"}</span><p>{message.content}</p></div>)}{busy && <div className="ai-message ai-message-assistant"><span>AI</span><p>正在处理…</p></div>}</div>
        {pending && <div className="ai-confirm" role="alertdialog" aria-label="确认工单修改"><p>以上修改尚未执行，请确认。</p><div><button type="button" disabled={busy} onClick={cancel}>取消</button><button className="confirm-action" type="button" disabled={busy} onClick={confirm}>{busy ? "执行中…" : "确认执行"}</button></div></div>}
        <form className="ai-input" onSubmit={(event) => submit(event)}><label htmlFor="ai-command">输入查询或操作指令</label><div><textarea id="ai-command" value={input} disabled={busy || Boolean(pending)} onChange={(event) => setInput(event.target.value)} onKeyDown={handleKeyDown} maxLength={1000} rows={3} placeholder="Enter发送，Shift+Enter换行" /><button type="submit" disabled={busy || Boolean(pending) || !input.trim()}>发送</button></div></form>
      </section>
    </aside>}
  </>;
}
