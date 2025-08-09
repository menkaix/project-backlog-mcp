import { HyperManagerAPIClient } from './api-client.js';
import winston from 'winston';

// Setup logging for resource manager
const logger = winston.createLogger({
  level: process.env['NODE_ENV'] === 'development' ? 'debug' : 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

export interface MCPResource {
  uri: string;
  name: string;
  description: string;
  mimeType?: string;
}

export class ResourceManager {
  private client: HyperManagerAPIClient;
  private cache: Map<string, { data: string; timestamp: number; ttl: number }> = new Map();

  constructor(client: HyperManagerAPIClient) {
    this.client = client;
  }

  // Define all available resources based on the Swagger API
  getAvailableResources(): MCPResource[] {
    return [
      // Diagram resources
      {
        uri: 'resource://diagrams/',
        name: 'All Diagrams',
        description: 'List of all diagrams in the system',
        mimeType: 'application/json'
      },
      {
        uri: 'resource://diagrams/{id}',
        name: 'Diagram Details',
        description: 'Detailed information about a specific diagram',
        mimeType: 'application/json'
      },
      {
        uri: 'resource://diagrams/{name}/definition',
        name: 'Diagram Definition',
        description: 'PlantUML definition of a diagram',
        mimeType: 'text/plain'
      },
      {
        uri: 'resource://diagrams/{name}/png',
        name: 'Diagram PNG',
        description: 'PNG image representation of a diagram',
        mimeType: 'image/png'
      },
      {
        uri: 'resource://diagrams/{name}/plantuml-url',
        name: 'Diagram PlantUML URL',
        description: 'PlantUML server URL for a diagram',
        mimeType: 'text/plain'
      },

      // Project resources
      {
        uri: 'resource://projects/',
        name: 'All Projects',
        description: 'List of all projects in the system',
        mimeType: 'application/json'
      },
      {
        uri: 'resource://projects/{project}/tree',
        name: 'Project Tree',
        description: 'Hierarchical structure of a project with all its components',
        mimeType: 'application/json'
      },

      // Story resources
      {
        uri: 'resource://stories/{storyId}/tree',
        name: 'Story Tree',
        description: 'Hierarchical structure of a story with all its features',
        mimeType: 'application/json'
      },

      // Feature resources
      {
        uri: 'resource://features/types',
        name: 'Feature Types',
        description: 'List of all available feature types',
        mimeType: 'application/json'
      },

      // Meta resources
      {
        uri: 'resource://api/schema',
        name: 'API Schema',
        description: 'Complete Swagger/OpenAPI schema of the HyperManager API',
        mimeType: 'application/yaml'
      },
      {
        uri: 'resource://api/endpoints',
        name: 'API Endpoints',
        description: 'Summary of all available API endpoints',
        mimeType: 'application/json'
      }
    ];
  }

  // Read a specific resource
  async readResource(uri: string): Promise<string> {
    logger.info('Reading resource:', { uri });

    // Check cache first
    const cached = this.cache.get(uri);
    if (cached && Date.now() - cached.timestamp < cached.ttl) {
      logger.debug('Returning cached resource:', { uri });
      return cached.data;
    }

    try {
      let data: string;
      let ttl = 5 * 60 * 1000; // Default 5 minutes cache

      if (uri === 'resource://diagrams/') {
        data = await this.client.listDiagrams();
        ttl = 2 * 60 * 1000; // 2 minutes for dynamic data
      } else if (uri.match(/^resource:\/\/diagrams\/([^\/]+)$/)) {
        const id = uri.split('/')[3];
        if (!id) throw new Error('Invalid diagram ID in URI');
        data = await this.client.getDiagram(id);
      } else if (uri.match(/^resource:\/\/diagrams\/([^\/]+)\/definition$/)) {
        const name = uri.split('/')[3];
        if (!name) throw new Error('Invalid diagram name in URI');
        data = await this.client.getDiagramDefinition(name);
      } else if (uri.match(/^resource:\/\/diagrams\/([^\/]+)\/png$/)) {
        const name = uri.split('/')[3];
        if (!name) throw new Error('Invalid diagram name in URI');
        data = await this.client.getDiagramPng(name);
        ttl = 10 * 60 * 1000; // 10 minutes for images
      } else if (uri.match(/^resource:\/\/diagrams\/([^\/]+)\/plantuml-url$/)) {
        const name = uri.split('/')[3];
        if (!name) throw new Error('Invalid diagram name in URI');
        data = await this.client.getDiagramPlantUmlUrl(name);
        ttl = 10 * 60 * 1000; // 10 minutes for URLs
      } else if (uri === 'resource://projects/') {
        data = await this.client.listProjects();
        ttl = 2 * 60 * 1000; // 2 minutes for dynamic data
      } else if (uri.match(/^resource:\/\/projects\/([^\/]+)\/tree$/)) {
        const project = uri.split('/')[3];
        if (!project) throw new Error('Invalid project name in URI');
        data = await this.client.getProjectTree(project);
        ttl = 5 * 60 * 1000; // 5 minutes for project trees
      } else if (uri.match(/^resource:\/\/stories\/([^\/]+)\/tree$/)) {
        const storyId = uri.split('/')[3];
        if (!storyId) throw new Error('Invalid story ID in URI');
        data = await this.client.getStoryTree(storyId);
        ttl = 5 * 60 * 1000; // 5 minutes for story trees
      } else if (uri === 'resource://features/types') {
        data = await this.client.listFeatureTypes();
        ttl = 30 * 60 * 1000; // 30 minutes for relatively static data
      } else if (uri === 'resource://api/schema') {
        // Return the Swagger schema (we'll need to read it from file)
        data = await this.getSwaggerSchema();
        ttl = 60 * 60 * 1000; // 1 hour for schema
      } else if (uri === 'resource://api/endpoints') {
        data = JSON.stringify(this.getApiEndpointsSummary(), null, 2);
        ttl = 60 * 60 * 1000; // 1 hour for endpoints summary
      } else {
        throw new Error(`Unknown resource URI: ${uri}`);
      }

      // Cache the result
      this.cache.set(uri, {
        data,
        timestamp: Date.now(),
        ttl
      });

      logger.info('Resource read successfully:', { 
        uri, 
        dataLength: data.length,
        cached: true,
        ttl: `${ttl / 1000}s`
      });

      return data;
    } catch (error) {
      logger.error('Error reading resource:', { 
        uri, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      throw error;
    }
  }

  // Get Swagger schema from file
  private async getSwaggerSchema(): Promise<string> {
    try {
      const fs = await import('fs/promises');
      const path = await import('path');
      const swaggerPath = path.join(process.cwd(), 'swagger.yml');
      return await fs.readFile(swaggerPath, 'utf-8');
    } catch (error) {
      logger.error('Error reading Swagger schema:', error);
      return JSON.stringify({
        error: 'Swagger schema not available',
        message: 'Could not read swagger.yml file'
      }, null, 2);
    }
  }

  // Generate API endpoints summary
  private getApiEndpointsSummary() {
    return {
      diagrams: {
        endpoints: [
          'POST /diagrams - Create a new diagram',
          'GET /diagrams - List all diagrams',
          'GET /diagrams/{id} - Get diagram by ID',
          'PATCH /diagrams/{id} - Update diagram',
          'GET /diagram/png/{diagram_name} - Get diagram as PNG',
          'GET /diagram/plant-url/{diagram_name} - Get PlantUML URL',
          'GET /diagram/plant-definition/{name} - Get diagram definition',
          'PATCH /diagram/update/{name} - Update diagram definition',
          'PATCH /diagram/update-graphic/{diagram_name} - Update diagram graphic'
        ]
      },
      projects: {
        endpoints: [
          'POST /projects - Create a new project',
          'GET /project-command/all - List all projects',
          'GET /project-command/{project}/tree - Get project tree'
        ]
      },
      stories: {
        endpoints: [
          'GET /story-command/{storyID}/tree - Get story tree',
          'POST /story-command/update - Update a story'
        ]
      },
      features: {
        endpoints: [
          'GET /featuretypes - List feature types',
          'GET /feature-command/refresh-types - Refresh feature types',
          'POST /feature-command/{story}/add - Add feature to story',
          'POST /feature-command/{parent}/add-child - Add child feature',
          'POST /feature-command/{parent}/adopt/{child} - Adopt child feature'
        ]
      },
      actors: {
        endpoints: [
          'POST /actor-command/{project}/add - Add actor to project',
          'POST /actor-command/{project}/{name}/add-story - Add story to actor'
        ]
      },
      utilities: {
        endpoints: [
          'GET /normalize-tasks - Normalize tasks'
        ]
      }
    };
  }

  // Clear cache for a specific URI or all cache
  clearCache(uri?: string): void {
    if (uri) {
      this.cache.delete(uri);
      logger.debug('Cache cleared for URI:', { uri });
    } else {
      this.cache.clear();
      logger.debug('All cache cleared');
    }
  }

  // Get cache statistics
  getCacheStats() {
    const now = Date.now();
    const entries = Array.from(this.cache.entries());
    
    return {
      totalEntries: entries.length,
      validEntries: entries.filter(([_, value]) => now - value.timestamp < value.ttl).length,
      expiredEntries: entries.filter(([_, value]) => now - value.timestamp >= value.ttl).length,
      totalSize: entries.reduce((sum, [_, value]) => sum + value.data.length, 0)
    };
  }
}
