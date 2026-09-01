"use client";

import { useState } from "react";
import type { TicketRecord } from "../lib/tickets";
import type { AiTicketFilter } from "../lib/ai-types";
import AiAssistant from "./AiAssistant";
import TicketBoard from "./TicketBoard";

export default function HomeWorkspace({ tickets, unavailable }:{ tickets:TicketRecord[]; unavailable:boolean }) {
  const [aiFilter, setAiFilter] = useState<AiTicketFilter | null>(null);

  function applyAiFilter(filter:AiTicketFilter) {
    setAiFilter(filter);
    window.setTimeout(() => document.getElementById("ticket-list-title")?.scrollIntoView({ behavior:"smooth", block:"start" }), 50);
  }

  return <><TicketBoard tickets={tickets} unavailable={unavailable} aiFilter={aiFilter} onClearAiFilter={() => setAiFilter(null)} /><AiAssistant onApplyFilter={applyAiFilter} /></>;
}
