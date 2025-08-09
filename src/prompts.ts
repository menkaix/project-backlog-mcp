import { HyperManagerAPIClient } from './api-client.js';
import winston from 'winston';

// Setup logging for prompt manager
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

export interface MCPPrompt {
  name: string;
  description: string;
  arguments?: Array<{
    name: string;
    description: string;
    required?: boolean;
  }>;
}

export interface PromptMessage {
  role: 'system' | 'user' | 'assistant';
  content: {
    type: 'text';
    text: string;
  };
}

export class PromptManager {
  private client: HyperManagerAPIClient;

  constructor(client: HyperManagerAPIClient) {
    this.client = client;
  }

  // Define all available prompts
  getAvailablePrompts(): MCPPrompt[] {
    return [
      {
        name: 'analyze_project',
        description: 'Analyze a project structure and provide insights about its components, stories, and features',
        arguments: [
          {
            name: 'project',
            description: 'The project identifier to analyze',
            required: true
          }
        ]
      },
      {
        name: 'create_diagram',
        description: 'Guide the creation of a new PlantUML diagram with best practices',
        arguments: [
          {
            name: 'diagram_type',
            description: 'Type of diagram to create (sequence, class, use case, etc.)',
            required: false
          },
          {
            name: 'context',
            description: 'Context or purpose of the diagram',
            required: false
          }
        ]
      },
      {
        name: 'generate_user_stories',
        description: 'Generate user stories based on project requirements and features',
        arguments: [
          {
            name: 'project',
            description: 'The project identifier',
            required: true
          },
          {
            name: 'feature_context',
            description: 'Context about the features to generate stories for',
            required: false
          }
        ]
      },
      {
        name: 'review_story_tree',
        description: 'Review and analyze a story tree structure for completeness and consistency',
        arguments: [
          {
            name: 'story_id',
            description: 'The story ID to review',
            required: true
          }
        ]
      },
      {
        name: 'suggest_features',
        description: 'Suggest features for a story based on available feature types and best practices',
        arguments: [
          {
            name: 'story_context',
            description: 'Context about the story to suggest features for',
            required: true
          }
        ]
      },
      {
        name: 'optimize_project_structure',
        description: 'Analyze and suggest optimizations for project structure and organization',
        arguments: [
          {
            name: 'project',
            description: 'The project identifier to optimize',
            required: true
          }
        ]
      }
    ];
  }

  // Get a specific prompt with its messages
  async getPrompt(name: string, args: Record<string, any> = {}): Promise<PromptMessage[]> {
    logger.info('Getting prompt:', { name, args });

    try {
      switch (name) {
        case 'analyze_project':
          return await this.getAnalyzeProjectPrompt(args['project']);
        
        case 'create_diagram':
          return await this.getCreateDiagramPrompt(args['diagram_type'], args['context']);
        
        case 'generate_user_stories':
          return await this.getGenerateUserStoriesPrompt(args['project'], args['feature_context']);
        
        case 'review_story_tree':
          return await this.getReviewStoryTreePrompt(args['story_id']);
        
        case 'suggest_features':
          return await this.getSuggestFeaturesPrompt(args['story_context']);
        
        case 'optimize_project_structure':
          return await this.getOptimizeProjectStructurePrompt(args['project']);
        
        default:
          throw new Error(`Unknown prompt: ${name}`);
      }
    } catch (error) {
      logger.error('Error getting prompt:', { 
        name, 
        args, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      throw error;
    }
  }

  private async getAnalyzeProjectPrompt(project: string): Promise<PromptMessage[]> {
    let projectData = '';
    try {
      projectData = await this.client.getProjectTree(project);
    } catch (error) {
      logger.warn('Could not fetch project data:', { project, error });
      projectData = 'Project data not available';
    }

    return [
      {
        role: 'system',
        content: {
          type: 'text',
          text: `You are a project management expert analyzing a software project structure. Your task is to provide comprehensive insights about the project's organization, components, stories, and features.

Focus on:
1. Overall project structure and organization
2. Story hierarchy and relationships
3. Feature distribution and completeness
4. Potential gaps or improvements
5. Best practices compliance

Be specific and actionable in your recommendations.`
        }
      },
      {
        role: 'user',
        content: {
          type: 'text',
          text: `Please analyze this project structure:

Project: ${project}

Project Data:
${projectData}

Provide a comprehensive analysis including:
1. Project overview and structure assessment
2. Story analysis (completeness, hierarchy, relationships)
3. Feature analysis (types, distribution, gaps)
4. Recommendations for improvement
5. Next steps for project development`
        }
      }
    ];
  }

  private async getCreateDiagramPrompt(diagramType?: string, context?: string): Promise<PromptMessage[]> {
    let availableDiagrams = '';
    try {
      availableDiagrams = await this.client.listDiagrams();
    } catch (error) {
      logger.warn('Could not fetch existing diagrams:', error);
      availableDiagrams = 'Existing diagrams not available';
    }

    const typeGuidance = diagramType ? 
      `Focus specifically on creating a ${diagramType} diagram.` : 
      'Consider what type of diagram would be most appropriate for the given context.';

    const contextGuidance = context ? 
      `Context: ${context}` : 
      'No specific context provided - create a general-purpose diagram.';

    return [
      {
        role: 'system',
        content: {
          type: 'text',
          text: `You are a PlantUML expert helping to create well-structured diagrams. Your task is to guide the creation of a new diagram following PlantUML best practices.

Key principles:
1. Use clear, descriptive names for all elements
2. Follow PlantUML syntax conventions
3. Include appropriate styling and formatting
4. Ensure the diagram serves its intended purpose
5. Make it maintainable and readable

${typeGuidance}`
        }
      },
      {
        role: 'user',
        content: {
          type: 'text',
          text: `I need help creating a PlantUML diagram.

${contextGuidance}

Existing diagrams in the system:
${availableDiagrams}

Please provide:
1. Recommended diagram type and structure
2. Complete PlantUML code for the diagram
3. Explanation of key elements and relationships
4. Suggestions for naming and organization
5. Tips for maintaining and updating the diagram`
        }
      }
    ];
  }

  private async getGenerateUserStoriesPrompt(project: string, featureContext?: string): Promise<PromptMessage[]> {
    let projectData = '';
    let featureTypes = '';
    
    try {
      projectData = await this.client.getProjectTree(project);
      featureTypes = await this.client.listFeatureTypes();
    } catch (error) {
      logger.warn('Could not fetch project or feature data:', { project, error });
    }

    return [
      {
        role: 'system',
        content: {
          type: 'text',
          text: `You are a product owner and user story expert. Your task is to generate well-structured user stories that follow best practices and align with the project's goals.

User story format: "As a [user type], I want [functionality] so that [benefit/value]"

Key principles:
1. Stories should be independent, negotiable, valuable, estimable, small, and testable (INVEST)
2. Include acceptance criteria for each story
3. Consider different user personas and their needs
4. Align with available feature types
5. Ensure stories fit within the project context`
        }
      },
      {
        role: 'user',
        content: {
          type: 'text',
          text: `Generate user stories for this project:

Project: ${project}
${featureContext ? `Feature Context: ${featureContext}` : ''}

Project Structure:
${projectData}

Available Feature Types:
${featureTypes}

Please provide:
1. 5-10 well-crafted user stories
2. Acceptance criteria for each story
3. Suggested feature types for each story
4. Priority recommendations
5. Dependencies between stories (if any)`
        }
      }
    ];
  }

  private async getReviewStoryTreePrompt(storyId: string): Promise<PromptMessage[]> {
    let storyData = '';
    try {
      storyData = await this.client.getStoryTree(storyId);
    } catch (error) {
      logger.warn('Could not fetch story data:', { storyId, error });
      storyData = 'Story data not available';
    }

    return [
      {
        role: 'system',
        content: {
          type: 'text',
          text: `You are a senior product manager reviewing story structures for quality and completeness. Your task is to analyze the story tree and provide actionable feedback.

Focus on:
1. Story structure and hierarchy
2. Feature completeness and appropriateness
3. Missing elements or gaps
4. Consistency and clarity
5. Alignment with best practices`
        }
      },
      {
        role: 'user',
        content: {
          type: 'text',
          text: `Please review this story tree structure:

Story ID: ${storyId}

Story Tree Data:
${storyData}

Provide a comprehensive review including:
1. Overall structure assessment
2. Feature analysis (completeness, appropriateness, gaps)
3. Hierarchy and relationship evaluation
4. Specific recommendations for improvement
5. Action items for story enhancement`
        }
      }
    ];
  }

  private async getSuggestFeaturesPrompt(storyContext: string): Promise<PromptMessage[]> {
    let featureTypes = '';
    try {
      featureTypes = await this.client.listFeatureTypes();
    } catch (error) {
      logger.warn('Could not fetch feature types:', error);
      featureTypes = 'Feature types not available';
    }

    return [
      {
        role: 'system',
        content: {
          type: 'text',
          text: `You are a feature design expert helping to identify and suggest appropriate features for user stories. Your task is to recommend features that align with the story context and available feature types.

Consider:
1. Story requirements and goals
2. Available feature types and their purposes
3. Feature relationships and dependencies
4. Implementation complexity and priority
5. User experience and value delivery`
        }
      },
      {
        role: 'user',
        content: {
          type: 'text',
          text: `Suggest features for this story context:

Story Context: ${storyContext}

Available Feature Types:
${featureTypes}

Please provide:
1. 3-5 recommended features with rationale
2. Feature type mapping for each suggestion
3. Priority order and dependencies
4. Implementation considerations
5. Alternative feature options`
        }
      }
    ];
  }

  private async getOptimizeProjectStructurePrompt(project: string): Promise<PromptMessage[]> {
    let projectData = '';
    try {
      projectData = await this.client.getProjectTree(project);
    } catch (error) {
      logger.warn('Could not fetch project data:', { project, error });
      projectData = 'Project data not available';
    }

    return [
      {
        role: 'system',
        content: {
          type: 'text',
          text: `You are a project architecture consultant specializing in optimizing project structures for better organization, maintainability, and team productivity.

Focus on:
1. Structural organization and hierarchy
2. Component relationships and dependencies
3. Scalability and maintainability
4. Team collaboration efficiency
5. Best practices alignment`
        }
      },
      {
        role: 'user',
        content: {
          type: 'text',
          text: `Analyze and optimize this project structure:

Project: ${project}

Current Project Structure:
${projectData}

Please provide:
1. Current structure analysis (strengths and weaknesses)
2. Optimization recommendations with rationale
3. Restructuring plan with priorities
4. Impact assessment of proposed changes
5. Implementation roadmap and best practices`
        }
      }
    ];
  }
}
