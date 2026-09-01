export type AiTicketFilter = {
  ticketNumber?:string;
  systemName?:string;
  date?:string;
  dateFrom?:string;
  dateTo?:string;
  reporter?:string;
  status?:"pending"|"processing"|"completed";
  deploymentStatus?:"undeployed"|"deployed";
  urgency?:number;
  summary:string;
};
