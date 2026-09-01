"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

type Message = { role:"user"|"assistant"; content:string };
type Confirmation = { tool:"update_ticket_status"|"update_deployment_status"; arguments:Record<string, unknown> };
type AssistantResult = { message?:string; error?:string; confirmation?:Confirmation };

const examples = ["查询今天的未部署工单", "查找星云实践平台的待处理工单", "工单100001现在是什么状态？"];

export default function AiAssistant() {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([{ role:"assistant", content:"你好，我可以按编号、系统、日期、反馈人和状态检索工单，也可以在确认后修改处理状态或部署状态。" }]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Confirmation | null>(null);

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
      const result = await request({ message:text, history });
      setMessages((current) => [...current, { role:"assistant", content:result.message ?? "请求已处理。" }]);
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
      setPending(null); router.refresh();
    } catch (error) {
      setMessages((current) => [...current, { role:"assistant", content:error instanceof Error ? error.message : "操作失败。" }]);
    } finally { setBusy(false); }
  }

  function cancel() {
    setPending(null);
    setMessages((current) => [...current, { role:"assistant", content:"已取消本次修改，没有变更任何工单。" }]);
  }

  return (
    <section className="ai-assistant" aria-label="AI工单助手">
      <div className="ai-notice"><strong>自然语言工单助手</strong><span>查询可直接执行；修改状态必须二次确认，权限和操作日志与后台保持一致。</span></div>
      <div className="ai-examples" aria-label="示例指令">{examples.map((example) => <button type="button" disabled={busy || Boolean(pending)} onClick={() => submit(undefined, example)} key={example}>{example}</button>)}</div>
      <div className="ai-messages" aria-live="polite">{messages.map((message, index) => <div className={`ai-message ai-message-${message.role}`} key={`${message.role}-${index}`}><span>{message.role === "user" ? "你" : "AI"}</span><p>{message.content}</p></div>)}{busy && <div className="ai-message ai-message-assistant"><span>AI</span><p>正在处理…</p></div>}</div>
      {pending && <div className="ai-confirm" role="alertdialog" aria-label="确认工单修改"><p>以上修改尚未执行，请确认。</p><div><button type="button" disabled={busy} onClick={cancel}>取消</button><button className="confirm-action" type="button" disabled={busy} onClick={confirm}>{busy ? "执行中…" : "确认执行"}</button></div></div>}
      <form className="ai-input" onSubmit={(event) => submit(event)}><label htmlFor="ai-command">输入查询或操作指令</label><div><textarea id="ai-command" value={input} disabled={busy || Boolean(pending)} onChange={(event) => setInput(event.target.value)} maxLength={1000} rows={3} placeholder="例如：查询星云实践平台今天的未部署工单" /><button type="submit" disabled={busy || Boolean(pending) || !input.trim()}>发送</button></div></form>
    </section>
  );
}
