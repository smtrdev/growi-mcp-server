import axios, { AxiosInstance, AxiosError, AxiosRequestConfig } from 'axios';
import { 
  GrowiPageResponse,
  GrowiPagesResponse,
  GrowiPageUpdateResponse,
  GrowiSearchResponse,
  GrowiErrorResponse 
} from './types/growi.js';

// Ensure console methods are redirected to stderr
const logToStderr = (...args: any[]) => {
  console.error(...args);
};

export class GrowiClient {
  private client: AxiosInstance;
  
  constructor(apiUrl: string, apiToken: string) {
    if (!apiUrl) throw new Error('GROWI API URL is required');
    if (!apiToken) throw new Error('GROWI API token is required');
    
    logToStderr(`Initializing GROWI client with URL: ${apiUrl}`);
    // Debug token (mask most of it for security)
    const maskedToken = apiToken.substring(0, 5) + '...' + apiToken.substring(apiToken.length - 5);
    logToStderr(`Using API token: ${maskedToken}`);
    
    this.client = axios.create({
      baseURL: apiUrl,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiToken}`,
      },
    });

    // Add request interceptor for logging
    this.client.interceptors.request.use((config) => {
      logToStderr(`🔄 Sending ${config.method?.toUpperCase()} request to: ${config.baseURL}${config.url}`);
      logToStderr(`🔄 Request params:`, config.params);
      logToStderr(`🔄 Request headers:`, this.sanitizeHeaders(config.headers));
      return config;
    });

    // Add response interceptor for logging
    this.client.interceptors.response.use(
      (response) => {
        logToStderr(`✅ Response status: ${response.status}`);
        logToStderr(`✅ Response data structure: ${this.getObjectStructure(response.data)}`);
        return response;
      },
      (error) => {
        this.logAxiosError(error);
        throw error;
      }
    );
  }

  // Helper method to sanitize headers (hide sensitive info)
  private sanitizeHeaders(headers: any): any {
    const sanitized = { ...headers };
    if (sanitized.Authorization) {
      sanitized.Authorization = sanitized.Authorization.substring(0, 15) + '...';
    }
    return sanitized;
  }

  // Helper method to get the structure of an object without the actual data
  private getObjectStructure(obj: any): string {
    if (!obj) return 'null or undefined';
    if (typeof obj !== 'object') return typeof obj;
    
    if (Array.isArray(obj)) {
      if (obj.length === 0) return 'empty array';
      return `array with ${obj.length} items, first item is ${this.getObjectStructure(obj[0])}`;
    }
    
    const keys = Object.keys(obj);
    if (keys.length === 0) return 'empty object';
    return `object with keys: ${keys.join(', ')}`;
  }

  // Helper method to log Axios errors in detail
  private logAxiosError(error: AxiosError): void {
    console.error('❌ Axios Error:', error.message);
    console.error('🔗 Request Config:', JSON.stringify({
      url: error.config?.url,
      method: error.config?.method,
      baseURL: error.config?.baseURL,
      params: error.config?.params
    }, null, 2));
    
    if (error.response) {
      console.error('📡 Response Status:', error.response.status);
      console.error('📡 Response Headers:', error.response.headers);
      console.error('📄 Response Data:', JSON.stringify(error.response.data, null, 2));
    } else if (error.request) {
      console.error('❓ No response received from server');
      console.error('🌐 Request details:', JSON.stringify(error.request, null, 2));
    }
  }

  /**
   * Get a list of pages
   * @param path The path to list pages from
   * @param limit Maximum number of pages to return
   * @param page Page number (1-based)
   */
  async listPages(path: string = '/', limit: number = 100, page: number = 1): Promise<GrowiPagesResponse> {
    logToStderr(`🔍 listPages - Starting request with params: path=${path}, limit=${limit}, page=${page}`);
    
    try {
      // Test with curl command to ensure API connectivity
      logToStderr(`💡 Equivalent curl command:\ncurl -s -H "Authorization: Bearer [TOKEN]" "${this.client.defaults.baseURL}/_api/v3/pages/list?path=${encodeURIComponent(path)}&limit=${limit}&page=${page}"`);
      
      const response = await this.client.get('/_api/v3/pages/list', {
        params: {
          path,
          limit,
          page,
        },
      });
      
      logToStderr(`✅ listPages - Success! Received ${response.data.pages?.length || 0} pages`);
      if (response.data.pages?.length > 0) {
        logToStderr(`📃 First page path: ${response.data.pages[0].path}`);
      }
      
      // Transform the response to match our expected format
      // Make sure all fields are JSON-serializable
      return {
        ok: true,
        pages: Array.isArray(response.data.pages) ? response.data.pages.map((page: any) => ({
          ...page,
          _id: String(page._id),
          path: String(page.path),
          creator: {
            _id: String(page.creator?._id || ''),
            name: String(page.creator?.name || '')
          },
          revision: {
            _id: String(page.revision?._id || ''),
            body: String(page.revision?.body || ''),
            author: {
              _id: String(page.revision?.author?._id || ''),
              name: String(page.revision?.author?.name || '')
            },
            createdAt: String(page.revision?.createdAt || '')
          },
          createdAt: String(page.createdAt || ''),
          updatedAt: String(page.updatedAt || '')
        })) : [],
        meta: {
          total: Number(response.data.totalCount || 0),
          limit: Number(limit),
          offset: Number((page - 1) * limit)
        }
      };
    } catch (error) {
      console.error(`❌ listPages - Error occurred: ${error instanceof Error ? error.message : String(error)}`);
      
      if (axios.isAxiosError(error)) {
        // Create a valid GrowiPagesResponse with detailed error info
        const errorMessage = error.response 
          ? `API Error (${error.response.status}): ${JSON.stringify(error.response.data)}` 
          : error.request 
            ? `No response from server: ${error.message}` 
            : `Request setup error: ${error.message}`;
            
        return {
          ok: false,
          pages: [],
          error: errorMessage
        };
      }
      
      return {
        ok: false,
        pages: [],
        error: `Unknown error: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Get a specific page by path
   * @param path The path of the page to get
   */
  async getPage(path: string): Promise<GrowiPageResponse> {
    try {
      const response = await this.client.get('/api/v3/page', {
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
      const response = await this.client.post('/api/v3/pages', {
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
      const response = await this.client.put('/api/v3/pages', {
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
      const response = await this.client.get('/api/v3/search', {
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