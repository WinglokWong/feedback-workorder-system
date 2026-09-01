export type AiTicketFilter = {
  ticketNumber?:string;
  systemName?:string;
  feedbackDate?:string;
  feedbackDateFrom?:string;
  feedbackDateTo?:string;
  publishedDate?:string;
  publishedDateFrom?:string;
  publishedDateTo?:string;
  reporter?:string;
  status?:"pending"|"processing"|"completed";
  deploymentStatus?:"undeployed"|"deployed";
  urgency?:number;
  summary:string;
};
