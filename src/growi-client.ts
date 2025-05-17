import axios, { AxiosInstance, AxiosError } from 'axios';
import { 
  GrowiPagesResponse,
} from './types/growi.js';
import https from 'https';
import http from 'http';
import { URL } from 'url';

// Ensure console methods are redirected to stderr
const logToStderr = (...args: any[]) => {
  console.error(...args);
};

export class GrowiClient {
  private client: AxiosInstance;
  readonly apiToken: string;
  readonly baseURL: string;
  
  constructor(apiUrl: string, apiToken: string) {
    if (!apiUrl) throw new Error('GROWI API URL is required');
    if (!apiToken) throw new Error('GROWI API token is required');
    
    logToStderr(`Initializing GROWI client with URL: ${apiUrl}`);
    
    this.apiToken = apiToken;
    this.baseURL = apiUrl;
    
    // シンプルなHTTPクライアントとして初期化
    this.client = axios.create({
      baseURL: apiUrl,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // レスポンスのエラーログ用インターセプタ追加
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        this.logAxiosError(error);
        throw error;
      }
    );
  }

  // エラーログ用ヘルパーメソッド
  private logAxiosError(error: AxiosError): void {
    console.error('❌ Axios Error:', error.message);
    
    if (error.response) {
      console.error('📡 Response Status:', error.response.status);
      if (error.response.data) {
        console.error('📡 Response Data:', typeof error.response.data === 'object' 
          ? JSON.stringify(error.response.data) 
          : String(error.response.data));
      }
    } else if (error.request) {
      console.error('❓ No response received from server');
    }
  }

  /**
   * クエリパラメータを含むURLを構築するヘルパーメソッド
   */
  private buildUrl(endpoint: string, params: Record<string, any> = {}): string {
    const url = new URL(this.baseURL + endpoint);
    
    // URLパラメータを追加
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.append(key, String(value));
      }
    });
    
    // アクセストークンを直接追加 - クエリパラメータ方式
    return url.toString() + `&access_token=${encodeURIComponent(this.apiToken)}`;
  }

  /**
   * curlと同様のHTTPリクエストを実行する
   */
  private makeNativeCurlRequest<T>(url: string): Promise<T> {
    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(url);
      
      // curlと同じリクエストオプションを使用
      const options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
        path: `${parsedUrl.pathname}${parsedUrl.search}`,
        method: 'GET',
        headers: {
          'User-Agent': 'curl/8.7.1',
          'Accept': '*/*'
        }
      };

      const safeToken = this.apiToken.substring(0, 5) + '...';
      logToStderr(`🌐 Making native curl-like request to URL: ${parsedUrl.protocol}//${parsedUrl.hostname}${options.path.replace(this.apiToken, safeToken)}`);
      
      const requestModule = parsedUrl.protocol === 'https:' ? https : http;
      const req = requestModule.request(options, (res) => {
        logToStderr(`🔄 Response status: ${res.statusCode}`);
        
        let data = '';
        res.on('data', (chunk) => {
          data += chunk.toString();
        });
        
        res.on('end', () => {
          logToStderr(`✅ Response completed. Data length: ${data.length}`);
          
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            try {
              const jsonData = JSON.parse(data);
              if (jsonData.pages) {
                logToStderr(`📊 Got ${jsonData.pages.length} pages out of ${jsonData.totalCount} total`);
              }
              resolve(jsonData as T);
            } catch (error) {
              reject(new Error(`Failed to parse JSON response: ${error instanceof Error ? error.message : String(error)}`));
            }
          } else {
            reject(new Error(`HTTP Error: ${res.statusCode} - ${data}`));
          }
        });
      });
      
      req.on('error', (error) => {
        logToStderr(`❌ Native HTTP request failed: ${error.message}`);
        reject(error);
      });
      
      req.end();
    });
  }

  /**
   * APIリクエストを実行するヘルパーメソッド
   * 常にcurl互換のnativeリクエストを使用
   */
  private async request<T>(
    method: 'get',
    endpoint: string,
    params: Record<string, any> = {}
  ): Promise<T> {
    try {
      // Build URL with query parameters and access_token
      const url = this.buildUrl(endpoint, params);
      
      // Use the curl-like native HTTP request 
      return await this.makeNativeCurlRequest<T>(url);
    } catch (error: any) {
      logToStderr(`❌ Request failed for ${endpoint}: ${error.message}`);
      throw error;
    }
  }

  /**
   * エラーレスポンスの整形
   */
  private formatErrorResponse<T>(error: any): T & { ok: false, error: string } {
    const errorMessage = axios.isAxiosError(error)
      ? error.response 
        ? `API Error (${error.response.status}): ${JSON.stringify(error.response.data)}` 
        : error.request 
          ? `No response from server: ${error.message}` 
          : `Request setup error: ${error.message}`
      : `Error: ${error instanceof Error ? error.message : String(error)}`;
          
    return {
      ok: false,
      error: errorMessage,
    } as T & { ok: false, error: string };
  }

  /**
   * ページ一覧を取得
   * @param path 取得対象のパス
   * @param limit 一度に取得する最大ページ数
   * @param page ページ番号（1始まり）
   */
  async listPages(path: string = '/', limit: number = 100, page: number = 1): Promise<GrowiPagesResponse> {
    try {
      const data = await this.request<any>('get', '/_api/v3/pages/list', {
        path,
        limit,
        page,
      });
      
      // レスポンスデータを整形
      const pagesCount = data.pages?.length || 0;
      
      return {
        ok: true,
        pages: Array.isArray(data.pages) ? data.pages.map((page: any) => ({
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
          total: Number(data.totalCount || 0),
          limit: Number(limit),
          offset: Number((page - 1) * limit)
        }
      };
    } catch (error: any) {
      return this.formatErrorResponse<GrowiPagesResponse>(error);
    }
  }
} 