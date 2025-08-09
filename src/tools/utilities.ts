import { HyperManagerAPIClient } from '../api-client.js';

export function setupUtilityTools(client: HyperManagerAPIClient) {
  return {
    tools: [
      {
        name: 'normalize_tasks',
        description: 'Normalize tasks in the system',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      }
    ],
    handlers: {
      normalize_tasks: async () => {
        return await client.normalizeTasks();
      }
    }
  };
}
