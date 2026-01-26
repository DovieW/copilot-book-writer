export type AgentMode = {
  id: string;
  displayName: string;
  description?: string;
  promptPath: string;
};

export type AgentCatalog = {
  agents: AgentMode[];
  defaultAgentId?: string;
};

export type BookKitStatus = {
  ok: boolean;
  error?: string;
};
