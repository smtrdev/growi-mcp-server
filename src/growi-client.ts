import axios, { AxiosInstance } from 'axios';
import { 
  GrowiPageResponse,
  GrowiPagesResponse,
  GrowiPageUpdateResponse,
  GrowiSearchResponse,
  GrowiErrorResponse 
} from './types/growi.js';

export class GrowiClient {
  private client: AxiosInstance;
  
  constructor(apiUrl: string, apiToken: string) {
    if (!apiUrl) throw new Error('GROWI API URL is required');
    if (!apiToken) throw new Error('GROWI API token is required');
    
    this.client = axios.create({
      baseURL: apiUrl,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiToken}`,
      },
    });
  }

  /**
   * Get a list of pages
   * @param path The path to list pages from
   * @param limit Maximum number of pages to return
   * @param offset Number of pages to skip
   */
  async listPages(path: string = '/', limit: number = 100, offset: number = 0): Promise<GrowiPagesResponse> {
    try {
      const response = await this.client.get('/api/pages', {
        params: {
          path,
          limit,
          offset,
        },
      });
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response) {
        // Create a valid GrowiPagesResponse with error info
        return {
          ok: false,
          pages: [],
          error: (error.response.data as any)?.error || error.message
        };
      }
      throw error;
    }
  }

  /**
   * Get a specific page by path
   * @param path The path of the page to get
   */
  async getPage(path: string): Promise<GrowiPageResponse> {
    try {
      const response = await this.client.get('/api/page', {
        params: { path },
      });
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response) {
        // Create a valid GrowiPageResponse with error info
        return {
          ok: false,
          page: {} as any,  // Empty page object to satisfy type
          error: (error.response.data as any)?.error || error.message
        };
      }
      throw error;
    }
  }

  /**
   * Create a new page
   * @param path The path for the new page
   * @param body The content of the page
   */
  async createPage(path: string, body: string): Promise<GrowiPageUpdateResponse> {
    try {
      const response = await this.client.post('/api/pages', {
        path,
        body,
      });
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response) {
        // Create a valid GrowiPageUpdateResponse with error info
        return {
          ok: false,
          page: {} as any,  // Empty page object to satisfy type
          revision: {} as any,  // Empty revision object to satisfy type
          error: (error.response.data as any)?.error || error.message
        };
      }
      throw error;
    }
  }

  /**
   * Update an existing page
   * @param path The path of the page to update
   * @param body The new content of the page
   */
  async updatePage(path: string, body: string): Promise<GrowiPageUpdateResponse> {
    try {
      const response = await this.client.put('/api/pages', {
        path,
        body,
      });
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response) {
        // Create a valid GrowiPageUpdateResponse with error info
        return {
          ok: false,
          page: {} as any,  // Empty page object to satisfy type
          revision: {} as any,  // Empty revision object to satisfy type
          error: (error.response.data as any)?.error || error.message
        };
      }
      throw error;
    }
  }

  /**
   * Search for pages
   * @param query The search query
   * @param limit Maximum number of results to return
   * @param offset Number of results to skip
   */
  async searchPages(query: string, limit: number = 20, offset: number = 0): Promise<GrowiSearchResponse> {
    try {
      const response = await this.client.get('/api/search', {
        params: {
          q: query,
          limit,
          offset,
        },
      });
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response) {
        // Create a valid GrowiSearchResponse with error info
        return {
          ok: false,
          data: [],
          error: (error.response.data as any)?.error || error.message
        };
      }
      throw error;
    }
  }
} 