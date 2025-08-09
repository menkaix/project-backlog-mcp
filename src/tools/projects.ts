import { HyperManagerAPIClient } from '../api-client.js';
import { ProjectCreateSchema } from '../types.js';

export function setupProjectTools(client: HyperManagerAPIClient) {
  return {
    tools: [
      {
        name: 'create_project',
        description: 'Create a new project in the backlog system',
        inputSchema: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Name of the project'
            },
            code: {
              type: 'string',
              description: 'Project code identifier'
            },
            clientName: {
              type: 'string',
              description: 'Name of the client (optional)'
            },
            description: {
              type: 'string',
              description: 'Project description (optional)'
            }
          },
          required: ['name', 'code']
        }
      },
      {
        name: 'list_projects',
        description: 'Get a list of all projects',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      },
      {
        name: 'get_project_tree',
        description: 'Get the component tree structure of a project',
        inputSchema: {
          type: 'object',
          properties: {
            project: {
              type: 'string',
              description: 'Project identifier'
            }
          },
          required: ['project']
        }
      }
    ],
    handlers: {
      create_project: async (args: any) => {
        const validatedArgs = ProjectCreateSchema.parse(args);
        return await client.createProject(validatedArgs);
      },
      list_projects: async () => {
        return await client.listProjects();
      },
      get_project_tree: async (args: any) => {
        if (!args.project || typeof args.project !== 'string') {
          throw new Error('project is required and must be a string');
        }
        return await client.getProjectTree(args.project);
      }
    }
  };
}
