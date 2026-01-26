import { defineTool } from "@github/copilot-sdk";
import { z } from "zod";

import { loadAgentCatalog } from "../bookkit/agentCatalog.js";

export type AgentSelectionBroker = {
  select: (agentId: string) => void | Promise<void>;
};

export function createAgentSelectionTool(
  repoRoot: string,
  broker: AgentSelectionBroker,
) {
  return defineTool("select_agent", {
    description:
      "Select a BookKit agent mode for subsequent responses. Use the agent id from the catalog.",
    parameters: z.object({
      agentId: z.string().min(1),
    }),
    handler: async ({ agentId }) => {
      const catalog = await loadAgentCatalog(repoRoot);
      const exists = catalog.agents.some((agent) => agent.id === agentId);
      if (!exists) {
        throw new Error("unknown agentId");
      }
      await broker.select(agentId);
      return { ok: true };
    },
  });
}
