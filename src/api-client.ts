import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { 
  DiagramCreateRequest, 
  DiagramUpdateRequest, 
  ProjectCreateRequest,
  StoryUpdateRequest,
  FeatureAddRequest,
  ActorAddRequest,
  StoryAddRequest
} from './types.js';

export class HyperManagerAPIClient {
  private client: AxiosInstance;
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.client = axios.create({
      baseURL: 'https://hypermanager-ia.endpoints.hypermanager.cloud.goog',
      timeout: 60000,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey
      }
    });

    // Add request interceptor for logging
    this.client.interceptors.request.use(
      (config) => {
        console.log(`API Request: ${config.method?.toUpperCase()} ${config.url}`);
        return config;
      },
      (error) => {
        console.error('API Request Error:', error);
        return Promise.reject(error);
      }
    );

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => {
        console.log(`API Response: ${response.status} ${response.config.url}`);
        return response;
      },
      (error) => {
        console.error('API Response Error:', error.response?.status, error.response?.data);
        return Promise.reject(error);
      }
    );
  }

  // Diagram methods
  async createDiagram(data: DiagramCreateRequest): Promise<string> {
    const response = await this.client.post<string>('/diagrams', data);
    return response.data;
  }

  async listDiagrams(): Promise<string> {
    const response = await this.client.get<string>('/diagrams');
    return response.data;
  }

  async getDiagram(id: string): Promise<string> {
    const response = await this.client.get<string>(`/diagrams/${id}`);
    return response.data;
  }

  async updateDiagram(id: string, data: DiagramUpdateRequest): Promise<string> {
    const response = await this.client.patch<string>(`/diagrams/${id}`, data);
    return response.data;
  }

  async getDiagramPng(diagramName: string): Promise<string> {
    const response = await this.client.get<string>(`/diagram/png/${diagramName}`);
    return response.data;
  }

  async getDiagramPlantUmlUrl(diagramName: string): Promise<string> {
    const response = await this.client.get<string>(`/diagram/plant-url/${diagramName}`);
    return response.data;
  }

  async getDiagramDefinition(name: string): Promise<string> {
    const response = await this.client.get<string>(`/diagram/plant-definition/${name}`);
    return response.data;
  }

  async updateDiagramDefinition(name: string, definition: string): Promise<string> {
    const response = await this.client.patch<string>(`/diagram/update/${name}`, definition, {
      headers: { 'Content-Type': 'text/plain' }
    });
    return response.data;
  }

  async updateDiagramGraphic(diagramName: string, data: string): Promise<string> {
    const response = await this.client.patch<string>(`/diagram/update-graphic/${diagramName}`, data, {
      headers: { 'Content-Type': 'text/plain' }
    });
    return response.data;
  }

  // Project methods
  async createProject(data: ProjectCreateRequest): Promise<string> {
    const response = await this.client.post<string>('/projects', data);
    return response.data;
  }

  async listProjects(): Promise<string> {
    const response = await this.client.get<string>('/project-command/all');
    return response.data;
  }

  async getProjectTree(project: string): Promise<string> {
    const response = await this.client.get<string>(`/project-command/${project}/tree`);
    return response.data;
  }

  // Story methods
  async getStoryTree(storyId: string): Promise<string> {
    const response = await this.client.get<string>(`/story-command/${storyId}/tree`);
    return response.data;
  }

  async updateStory(data: StoryUpdateRequest): Promise<string> {
    const response = await this.client.post<string>('/story-command/update', data);
    return response.data;
  }

  // Feature methods
  async refreshFeatureTypes(): Promise<string> {
    const response = await this.client.get<string>('/feature-command/refresh-types');
    return response.data;
  }

  async listFeatureTypes(): Promise<string> {
    const response = await this.client.get<string>('/featuretypes');
    return response.data;
  }

  async addFeatureToStory(story: string, data: FeatureAddRequest): Promise<string> {
    const response = await this.client.post<string>(`/feature-command/${story}/add`, data);
    return response.data;
  }

  async addChildFeature(parent: string, data: FeatureAddRequest): Promise<string> {
    const response = await this.client.post<string>(`/feature-command/${parent}/add-child`, data);
    return response.data;
  }

  async adoptChildFeature(parent: string, child: string): Promise<string> {
    const response = await this.client.post<string>(`/feature-command/${parent}/adopt/${child}`);
    return response.data;
  }

  // Actor methods
  async addActor(project: string, data: ActorAddRequest): Promise<string> {
    const response = await this.client.post<string>(`/actor-command/${project}/add`, data);
    return response.data;
  }

  async addStoryToActor(project: string, name: string, data: StoryAddRequest): Promise<string> {
    const response = await this.client.post<string>(`/actor-command/${project}/${name}/add-story`, data);
    return response.data;
  }

  // Utility methods
  async normalizeTasks(): Promise<string> {
    const response = await this.client.get<string>('/normalize-tasks');
    return response.data;
  }
}
