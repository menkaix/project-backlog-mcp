import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { HyperManagerAPIClient } from '../api-client.js';
import { DiagramCreateSchema, DiagramUpdateSchema } from '../types.js';

export function setupDiagramTools(client: HyperManagerAPIClient) {
  return {
    tools: [
      {
        name: 'create_diagram',
        description: 'Create a new diagram in the project backlog system',
        inputSchema: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Name of the diagram'
            },
            definition: {
              type: 'string',
              description: 'PlantUML definition of the diagram'
            }
          },
          required: ['name', 'definition']
        }
      },
      {
        name: 'list_diagrams',
        description: 'Get a list of all diagrams',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      },
      {
        name: 'get_diagram',
        description: 'Get a diagram by its ID',
        inputSchema: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'MongoDB ID of the diagram'
            }
          },
          required: ['id']
        }
      },
      {
        name: 'update_diagram',
        description: 'Update a diagram by its ID',
        inputSchema: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'MongoDB ID of the diagram'
            },
            name: {
              type: 'string',
              description: 'New name for the diagram'
            }
          },
          required: ['id']
        }
      },
      {
        name: 'get_diagram_png',
        description: 'Get a diagram as PNG image',
        inputSchema: {
          type: 'object',
          properties: {
            diagramName: {
              type: 'string',
              description: 'Name of the diagram'
            }
          },
          required: ['diagramName']
        }
      },
      {
        name: 'get_diagram_plantuml_url',
        description: 'Get a diagram as PlantUML URL',
        inputSchema: {
          type: 'object',
          properties: {
            diagramName: {
              type: 'string',
              description: 'Name of the diagram'
            }
          },
          required: ['diagramName']
        }
      },
      {
        name: 'get_diagram_definition',
        description: 'Get the PlantUML definition of a diagram',
        inputSchema: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Name of the diagram'
            }
          },
          required: ['name']
        }
      },
      {
        name: 'update_diagram_definition',
        description: 'Update the PlantUML definition of a diagram',
        inputSchema: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Name of the diagram'
            },
            definition: {
              type: 'string',
              description: 'New PlantUML definition'
            }
          },
          required: ['name', 'definition']
        }
      },
      {
        name: 'update_diagram_graphic',
        description: 'Update a diagram and return the updated image',
        inputSchema: {
          type: 'object',
          properties: {
            diagramName: {
              type: 'string',
              description: 'Name of the diagram'
            },
            data: {
              type: 'string',
              description: 'JSON data for the diagram update'
            }
          },
          required: ['diagramName', 'data']
        }
      }
    ],
    handlers: {
      create_diagram: async (args: any) => {
        const validatedArgs = DiagramCreateSchema.parse(args);
        return await client.createDiagram(validatedArgs);
      },
      list_diagrams: async () => {
        return await client.listDiagrams();
      },
      get_diagram: async (args: any) => {
        if (!args.id || typeof args.id !== 'string') {
          throw new Error('ID is required and must be a string');
        }
        return await client.getDiagram(args.id);
      },
      update_diagram: async (args: any) => {
        if (!args.id || typeof args.id !== 'string') {
          throw new Error('ID is required and must be a string');
        }
        const validatedArgs = DiagramUpdateSchema.parse(args);
        const { id, ...updateData } = args;
        return await client.updateDiagram(id, updateData);
      },
      get_diagram_png: async (args: any) => {
        if (!args.diagramName || typeof args.diagramName !== 'string') {
          throw new Error('diagramName is required and must be a string');
        }
        return await client.getDiagramPng(args.diagramName);
      },
      get_diagram_plantuml_url: async (args: any) => {
        if (!args.diagramName || typeof args.diagramName !== 'string') {
          throw new Error('diagramName is required and must be a string');
        }
        return await client.getDiagramPlantUmlUrl(args.diagramName);
      },
      get_diagram_definition: async (args: any) => {
        if (!args.name || typeof args.name !== 'string') {
          throw new Error('name is required and must be a string');
        }
        return await client.getDiagramDefinition(args.name);
      },
      update_diagram_definition: async (args: any) => {
        if (!args.name || typeof args.name !== 'string') {
          throw new Error('name is required and must be a string');
        }
        if (!args.definition || typeof args.definition !== 'string') {
          throw new Error('definition is required and must be a string');
        }
        return await client.updateDiagramDefinition(args.name, args.definition);
      },
      update_diagram_graphic: async (args: any) => {
        if (!args.diagramName || typeof args.diagramName !== 'string') {
          throw new Error('diagramName is required and must be a string');
        }
        if (!args.data || typeof args.data !== 'string') {
          throw new Error('data is required and must be a string');
        }
        return await client.updateDiagramGraphic(args.diagramName, args.data);
      }
    }
  };
}
