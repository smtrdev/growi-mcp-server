import { z } from 'zod';
import { GrowiClient } from '../growi-client.js';
import { GrowiPage } from '../types/growi.js';
import https from 'https';
import http from 'http';
import { URL } from 'url';

// Ensure logging goes to stderr
const logToStderr = (...args: any[]) => {
  console.error(...args);
};

export const listPagesSchema = z.object({
  path: z.union([z.string(), z.number()]).optional().describe('Path prefix to list pages from (default: /)'),
  limit: z.union([z.string(), z.number()]).optional().describe('Maximum number of pages to return (default: 100)'),
  page: z.union([z.string(), z.number()]).optional().describe('Page number (1-based, default: 1)'),
});

export type ListPagesParams = z.infer<typeof listPagesSchema>;

/**
 * 直接HTTPリクエストを実行する関数
 * curlコマンドと同様の挙動を実現する
 */
function makeNativeHttpRequest(url: string, apiToken: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    logToStderr(`🌐 Making native HTTP request to: ${url.replace(apiToken, apiToken.substring(0, 5) + '...')}`);
    
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
      path: `${parsedUrl.pathname}${parsedUrl.search}`,
      method: 'GET',
      headers: {
        'User-Agent': 'curl/8.7.1', 
        'Accept': '*/*',
      }
    };
    
    const protocol = parsedUrl.protocol === 'https:' ? https : http;
    const req = protocol.request(options, (res) => {
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
            logToStderr(`📊 Got ${jsonData.pages?.length || 0} pages out of ${jsonData.totalCount || 0} total`);
            resolve(jsonData);
          } catch (error) {
            reject(new Error(`Failed to parse JSON: ${error instanceof Error ? error.message : String(error)}`));
          }
        } else {
          reject(new Error(`HTTP Error: ${res.statusCode} ${res.statusMessage || ''} - ${data}`));
        }
      });
    });
    
    req.on('error', (error) => {
      logToStderr(`❌ Request failed: ${error.message}`);
      reject(error);
    });
    
    req.end();
  });
}

export async function listPages(
  client: GrowiClient,
  params: ListPagesParams
): Promise<{ content: { type: string; text: string }[] }> {
  try {
    // Parameter validation and type conversion
    let path = '/';
    let limit = 100;
    let page = 1;

    if (params) {
      // Handle path parameter
      if (params.path !== undefined) {
        path = String(params.path); // Ensure string type
        if (!path.startsWith('/')) {
          path = '/' + path; // Ensure path starts with /
        }
      }

      // Handle limit parameter
      if (params.limit !== undefined) {
        if (typeof params.limit === 'string') {
          limit = parseInt(params.limit, 10);
          logToStderr(`📝 Converted string limit to number: ${limit}`);
        } else if (typeof params.limit === 'number') {
          limit = params.limit;
        }
        
        // Ensure limit is within reasonable bounds
        if (isNaN(limit) || limit < 1) {
          limit = 100;
          logToStderr(`⚠️ Invalid limit value, reset to default: ${limit}`);
        } else if (limit > 1000) {
          limit = 1000;
          logToStderr(`⚠️ Limit too large, capped at: ${limit}`);
        }
      }

      // Handle page parameter
      if (params.page !== undefined) {
        if (typeof params.page === 'string') {
          page = parseInt(params.page, 10);
          logToStderr(`📝 Converted string page to number: ${page}`);
        } else if (typeof params.page === 'number') {
          page = params.page;
        }
        
        // Ensure page is within reasonable bounds
        if (isNaN(page) || page < 1) {
          page = 1;
          logToStderr(`⚠️ Invalid page value, reset to default: ${page}`);
        }
      }
    } else {
      logToStderr('⚠️ No parameters provided, using defaults');
    }

    logToStderr(`🔍 Calling GROWI API with: path="${path}", limit=${limit}, page=${page}`);
    
    // ここで直接curlと同様のHTTPリクエストを実行
    try {
      const apiUrl = (client as any).baseURL;
      const apiToken = (client as any).apiToken;
      
      if (!apiUrl || !apiToken) {
        throw new Error('Missing API URL or token');
      }

      // curlで成功するのと同じURLを構築 - URL は自動的にエンコードを行うため注意
      const url = new URL(`${apiUrl}/_api/v3/pages/list`);
      url.searchParams.append('path', path);
      url.searchParams.append('limit', String(limit));
      url.searchParams.append('page', String(page));
      
      // 重要: クエリパラメータとしてトークンを追加
      // FIXME: Authorization headerを使用する
      // 直接トークンを文字列に追加し、URLエンコードの問題を回避する
      const urlString = url.toString() + `&access_token=${encodeURIComponent(apiToken)}`;
      
      // 直接HTTPリクエストを行う
      const data = await makeNativeHttpRequest(urlString, apiToken);
      
      // 成功した場合は直接結果を返す
      if (data && data.pages) {
        // 結果の整形
        const pagesCount = data.pages.length || 0;
        const startIndex = (page - 1) * limit + 1;
        const endIndex = Math.min(startIndex + pagesCount - 1, data.totalCount || 0);
        
        let resultText = '';
        if (pagesCount === 0) {
          resultText = `No pages found under path: ${path}`;
        } else {
          resultText = `Found ${pagesCount} pages under path: ${path}\n\n`;
          data.pages.forEach((page: any, index: number) => {
            if (index < 10) logToStderr(`  - Page ${index+1}: ${page.path}`);
            resultText += `- ${page.path}\n`;
          });
          if (pagesCount > 10) {
            logToStderr(`  - ... and ${pagesCount - 10} more pages`);
          }
          
          resultText += `\nShowing ${startIndex}-${endIndex} of ${data.totalCount} total pages`;
        }
        
        return {
          content: [
            {
              type: 'text',
              text: resultText,
            },
          ],
        };
      }
    } catch (directError) {
      logToStderr(`❌ Direct request failed: ${directError instanceof Error ? directError.message : String(directError)}`);
      // エラーの場合はここでcatchして、次の処理に進む
    }
    
    // GrowiClientを使用したフォールバック処理
    const response = await client.listPages(path, limit, page);

    // Log more detailed response info for debugging
    logToStderr(`📋 GROWI API response details:`, {
      ok: response.ok,
      pagesCount: response.pages?.length || 0,
      hasError: response.error ? true : false,
      error: response.error || 'none',
      meta: response.meta || 'none'
    });

    if (!response.ok) {
      console.error(`❌ GROWI API returned error: ${response.error || 'Unknown error'}`);
      return {
        content: [
          {
            type: 'text',
            text: `Error listing pages (path: ${path}, offset: ${(page-1) * limit}): ${response.error || 'Unknown error'}`,
          },
        ],
      };
    }

    logToStderr(`✅ GROWI API returned ${response.pages?.length || 0} pages`);
    let resultText = '';
    
    if (!response.pages || response.pages.length === 0) {
      resultText = `No pages found under path: ${path}`;
      logToStderr('ℹ️ No pages returned from GROWI API');
    } else {
      resultText = `Found ${response.pages.length} pages under path: ${path}\n\n`;
      response.pages.forEach((page: GrowiPage, index: number) => {
        if (index < 10) logToStderr(`  - Page ${index+1}: ${page.path}`);
        resultText += `- ${page.path}\n`;
      });
      if (response.pages.length > 10) {
        logToStderr(`  - ... and ${response.pages.length - 10} more pages`);
      }

      if (response.meta) {
        const startIndex = (page - 1) * limit + 1;
        const endIndex = Math.min(startIndex + response.pages.length - 1, response.meta.total);
        resultText += `\nShowing ${startIndex}-${endIndex} of ${response.meta.total} total pages`;
        logToStderr(`ℹ️ Pagination info: showing ${startIndex}-${endIndex} of ${response.meta.total} total pages`);
      }
    }

    return {
      content: [
        {
          type: 'text',
          text: resultText,
        },
      ],
    };
  } catch (error) {
    console.error('❌ Exception in listPages tool:', error);
    return {
      content: [
        {
          type: 'text',
          text: `Error listing pages: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
} 