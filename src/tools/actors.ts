import { HyperManagerAPIClient } from '../api-client.js';
import { ActorAddSchema, StoryAddSchema } from '../types.js';

export function setupActorTools(client: HyperManagerAPIClient) {
  return {
    tools: [
      {
        name: 'add_actor',
        description: 'Add a new actor to a project',
        inputSchema: {
          type: 'object',
          properties: {
            project: {
              type: 'string',
              description: 'ID of the project to add the actor to'
            },
            data: {
              type: 'object',
              description: 'Actor data (flexible object structure)'
            }
          },
          required: ['project', 'data']
        }
      },
      {
        name: 'add_story_to_actor',
        description: 'Add a story to an actor in a project',
        inputSchema: {
          type: 'object',
          properties: {
            project: {
              type: 'string',
              description: 'ID of the project'
            },
            name: {
              type: 'string',
              description: 'Name of the actor'
            },
            data: {
              type: 'object',
              description: 'Story data (flexible object structure)'
            }
          },
          required: ['project', 'name', 'data']
        }
      }
    ],
    handlers: {
      add_actor: async (args: any) => {
        if (!args.project || typeof args.project !== 'string') {
          throw new Error('project is required and must be a string');
        }
        if (!args.data || typeof args.data !== 'object') {
          throw new Error('data is required and must be an object');
        }
        const validatedData = ActorAddSchema.parse(args.data);
        return await client.addActor(args.project, validatedData);
      },
      add_story_to_actor: async (args: any) => {
        if (!args.project || typeof args.project !== 'string') {
          throw new Error('project is required and must be a string');
        }
        if (!args.name || typeof args.name !== 'string') {
          throw new Error('name is required and must be a string');
        }
        if (!args.data || typeof args.data !== 'object') {
          throw new Error('data is required and must be an object');
        }
        const validatedData = StoryAddSchema.parse(args.data);
        return await client.addStoryToActor(args.project, args.name, validatedData);
      }
    }
  };
}
