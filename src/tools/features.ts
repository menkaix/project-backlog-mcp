import { HyperManagerAPIClient } from '../api-client.js';
import { FeatureAddSchema } from '../types.js';

export function setupFeatureTools(client: HyperManagerAPIClient) {
  return {
    tools: [
      {
        name: 'refresh_feature_types',
        description: 'Refresh the available feature types in the system',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      },
      {
        name: 'list_feature_types',
        description: 'Get a list of all available feature types',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      },
      {
        name: 'add_feature_to_story',
        description: 'Add a new feature to a story',
        inputSchema: {
          type: 'object',
          properties: {
            story: {
              type: 'string',
              description: 'ID of the story to add the feature to'
            },
            data: {
              type: 'object',
              description: 'Feature data (flexible object structure)'
            }
          },
          required: ['story', 'data']
        }
      },
      {
        name: 'add_child_feature',
        description: 'Add a child feature to a parent feature',
        inputSchema: {
          type: 'object',
          properties: {
            parent: {
              type: 'string',
              description: 'ID of the parent feature'
            },
            data: {
              type: 'object',
              description: 'Child feature data (flexible object structure)'
            }
          },
          required: ['parent', 'data']
        }
      },
      {
        name: 'adopt_child_feature',
        description: 'Make a feature adopt another feature as its child',
        inputSchema: {
          type: 'object',
          properties: {
            parent: {
              type: 'string',
              description: 'ID of the parent feature'
            },
            child: {
              type: 'string',
              description: 'ID of the child feature to adopt'
            }
          },
          required: ['parent', 'child']
        }
      }
    ],
    handlers: {
      refresh_feature_types: async () => {
        return await client.refreshFeatureTypes();
      },
      list_feature_types: async () => {
        return await client.listFeatureTypes();
      },
      add_feature_to_story: async (args: any) => {
        if (!args.story || typeof args.story !== 'string') {
          throw new Error('story is required and must be a string');
        }
        if (!args.data || typeof args.data !== 'object') {
          throw new Error('data is required and must be an object');
        }
        const validatedData = FeatureAddSchema.parse(args.data);
        return await client.addFeatureToStory(args.story, validatedData);
      },
      add_child_feature: async (args: any) => {
        if (!args.parent || typeof args.parent !== 'string') {
          throw new Error('parent is required and must be a string');
        }
        if (!args.data || typeof args.data !== 'object') {
          throw new Error('data is required and must be an object');
        }
        const validatedData = FeatureAddSchema.parse(args.data);
        return await client.addChildFeature(args.parent, validatedData);
      },
      adopt_child_feature: async (args: any) => {
        if (!args.parent || typeof args.parent !== 'string') {
          throw new Error('parent is required and must be a string');
        }
        if (!args.child || typeof args.child !== 'string') {
          throw new Error('child is required and must be a string');
        }
        return await client.adoptChildFeature(args.parent, args.child);
      }
    }
  };
}
