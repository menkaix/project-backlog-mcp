import { HyperManagerAPIClient } from '../api-client.js';
import { StoryUpdateSchema } from '../types.js';

export function setupStoryTools(client: HyperManagerAPIClient) {
  return {
    tools: [
      {
        name: 'get_story_tree',
        description: 'Get the tree structure of a story by its ID',
        inputSchema: {
          type: 'object',
          properties: {
            storyId: {
              type: 'string',
              description: 'ID of the story'
            }
          },
          required: ['storyId']
        }
      },
      {
        name: 'update_story',
        description: 'Update a story with new data',
        inputSchema: {
          type: 'object',
          properties: {
            data: {
              type: 'object',
              description: 'Story data to update (flexible object structure)'
            }
          },
          required: ['data']
        }
      }
    ],
    handlers: {
      get_story_tree: async (args: any) => {
        if (!args.storyId || typeof args.storyId !== 'string') {
          throw new Error('storyId is required and must be a string');
        }
        return await client.getStoryTree(args.storyId);
      },
      update_story: async (args: any) => {
        if (!args.data || typeof args.data !== 'object') {
          throw new Error('data is required and must be an object');
        }
        const validatedArgs = StoryUpdateSchema.parse(args.data);
        return await client.updateStory(validatedArgs);
      }
    }
  };
}
