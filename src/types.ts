import { z } from 'zod';

// API Response types based on the Swagger definition
export interface DiagramCreateRequest {
  name: string;
  definition: string;
}

export interface DiagramUpdateRequest {
  name?: string;
}

export interface ProjectCreateRequest {
  name: string;
  code: string;
  clientName?: string;
  description?: string;
}

export interface StoryUpdateRequest {
  [key: string]: any;
}

export interface FeatureAddRequest {
  [key: string]: any;
}

export interface ActorAddRequest {
  [key: string]: any;
}

export interface StoryAddRequest {
  [key: string]: any;
}

// Authentication types
export interface AuthToken {
  id: string;
  type: 'master' | 'team' | 'readonly';
  permissions: string[];
  expiresAt?: Date;
  createdAt: Date;
  lastUsed?: Date;
  description?: string;
}

export interface JWTPayload {
  tokenId: string;
  type: 'master' | 'team' | 'readonly';
  permissions: string[];
  iat: number;
  exp?: number;
}

// Validation schemas
export const DiagramCreateSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  definition: z.string().min(1, 'Definition is required')
});

export const DiagramUpdateSchema = z.object({
  name: z.string().optional()
});

export const ProjectCreateSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  code: z.string().min(1, 'Code is required'),
  clientName: z.string().optional(),
  description: z.string().optional()
});

export const StoryUpdateSchema = z.object({}).passthrough();

export const FeatureAddSchema = z.object({}).passthrough();

export const ActorAddSchema = z.object({}).passthrough();

export const StoryAddSchema = z.object({}).passthrough();

// Tool permission mappings
export const TOOL_PERMISSIONS = {
  // Diagram tools
  'create_diagram': ['diagrams:write'],
  'list_diagrams': ['diagrams:read'],
  'get_diagram': ['diagrams:read'],
  'update_diagram': ['diagrams:write'],
  'get_diagram_png': ['diagrams:read'],
  'get_diagram_plantuml_url': ['diagrams:read'],
  'get_diagram_definition': ['diagrams:read'],
  'update_diagram_definition': ['diagrams:write'],
  'update_diagram_graphic': ['diagrams:write'],
  
  // Project tools
  'create_project': ['projects:write'],
  'list_projects': ['projects:read'],
  'get_project_tree': ['projects:read'],
  
  // Story tools
  'get_story_tree': ['stories:read'],
  'update_story': ['stories:write'],
  
  // Feature tools
  'refresh_feature_types': ['features:write'],
  'list_feature_types': ['features:read'],
  'add_feature_to_story': ['features:write'],
  'add_child_feature': ['features:write'],
  'adopt_child_feature': ['features:write'],
  
  // Actor tools
  'add_actor': ['actors:write'],
  'add_story_to_actor': ['actors:write'],
  
  // Utility tools
  'normalize_tasks': ['utilities:write']
} as const;

// Permission sets for different token types
export const PERMISSION_SETS = {
  master: [
    'diagrams:read', 'diagrams:write',
    'projects:read', 'projects:write',
    'stories:read', 'stories:write',
    'features:read', 'features:write',
    'actors:read', 'actors:write',
    'utilities:read', 'utilities:write',
    'admin:read', 'admin:write'
  ],
  team: [
    'diagrams:read', 'diagrams:write',
    'projects:read', 'projects:write',
    'stories:read', 'stories:write',
    'features:read', 'features:write',
    'actors:read', 'actors:write',
    'utilities:read', 'utilities:write'
  ],
  readonly: [
    'diagrams:read',
    'projects:read',
    'stories:read',
    'features:read',
    'actors:read',
    'utilities:read'
  ]
} as const;

export type ToolName = keyof typeof TOOL_PERMISSIONS;
export type Permission = typeof PERMISSION_SETS.master[number];
export type TokenType = keyof typeof PERMISSION_SETS;
