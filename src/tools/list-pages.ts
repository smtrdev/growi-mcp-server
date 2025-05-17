import { z } from 'zod';
import https from 'https';
import http from 'http';
import { URL } from 'url';
import { GrowiClient } from '../growi-client.js';

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

interface NormalizedParams {
  path: string;
  limit: number;
  page: number;
}

function normalizeParams(params?: ListPagesParams): NormalizedParams {
  if (!params) {
    logToStderr('No parameters provided, using defaults');
    return { path: '/', limit: 100, page: 1 };
  }

  const parsed = listPagesSchema.parse(params);

  let path = parsed.path !== undefined ? String(parsed.path) : '/';
  if (!path.startsWith('/')) path = '/' + path;

  let limit = parsed.limit !== undefined ? Number(parsed.limit) : 100;
  if (typeof parsed.limit === 'string') {
    logToStderr(`Converted string limit to number: ${limit}`);
  }
  if (isNaN(limit) || limit < 1) {
    limit = 100;
    logToStderr(`Invalid limit value, reset to default: ${limit}`);
  } else if (limit > 1000) {
    limit = 1000;
    logToStderr(`Limit too large, capped at: ${limit}`);
  }

  let page = parsed.page !== undefined ? Number(parsed.page) : 1;
  if (typeof parsed.page === 'string') {
    logToStderr(`Converted string page to number: ${page}`);
  }
  if (isNaN(page) || page < 1) {
    page = 1;
    logToStderr(`Invalid page value, reset to default: ${page}`);
  }

  return { path, limit, page };
}

function formatResultText(
  path: string,
  pages: { path: string }[] | undefined,
  total: number | undefined,
  limit: number,
  page: number,
): string {
  if (!pages || pages.length === 0) {
    logToStderr('No pages returned from API');
    return `No pages found under path: ${path}`;
  }

  const startIndex = (page - 1) * limit + 1;
  const endIndex = Math.min(startIndex + pages.length - 1, total ?? pages.length);

  let text = `Found ${pages.length} pages under path: ${path}\n\n`;
  pages.forEach((p, index) => {
    if (index < 10) logToStderr(`  - Page ${index + 1}: ${p.path}`);
    text += `- ${p.path}\n`;
  });
  if (pages.length > 10) {
    logToStderr(`  - ... and ${pages.length - 10} more pages`);
  }

  if (total !== undefined) {
    text += `\nShowing ${startIndex}-${endIndex} of ${total} total pages`;
    logToStderr(`Pagination info: showing ${startIndex}-${endIndex} of ${total} total pages`);
  }

  return text;
}

/**
 * 直接HTTPリクエストを実行する関数
 * curlコマンドと同様の挙動を実現する
 */
function makeNativeHttpRequest(url: string, apiToken: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    logToStderr(`Making native HTTP request to: ${url}`);
    
    // トークンデータをx-www-form-urlencodedデータとして準備
    const postData = `access_token=${encodeURIComponent(apiToken)}`;
    
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
      path: `${parsedUrl.pathname}${parsedUrl.search}`,
      method: 'GET',
      headers: {
        'User-Agent': 'curl/8.7.1', 
        'Accept': '*/*',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData)
      }
    };
    
    logToStderr(`Sending access_token in request body: ${apiToken.substring(0, 5)}...`);
    
    const protocol = parsedUrl.protocol === 'https:' ? https : http;
    const req = protocol.request(options, (res) => {
      logToStderr(`Response status: ${res.statusCode}`);
      
      let data = '';
      res.on('data', (chunk) => {
        data += chunk.toString();
      });
      
      res.on('end', () => {
        logToStderr(`Response completed. Data length: ${data.length}`);
        
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const jsonData = JSON.parse(data);
            logToStderr(`Got ${jsonData.pages?.length || 0} pages out of ${jsonData.totalCount || 0} total`);
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
      logToStderr(`Request failed: ${error.message}`);
      reject(error);
    });
    
    // Send the request with the access token in the body
    req.write(postData);
    req.end();
  });
}

export async function listPages(
  client: GrowiClient,
  params: ListPagesParams
): Promise<{ content: { type: string; text: string }[] }> {
  try {
    const { path, limit, page } = normalizeParams(params);
    logToStderr(`Calling GROWI API with: path="${path}", limit=${limit}, page=${page}`);
    
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
      
      // トークンはリクエストボディで送信するため、URLには含めない
      const urlString = url.toString();
      
      // 直接HTTPリクエストを行う
      const data = await makeNativeHttpRequest(urlString, apiToken);

      if (data && data.pages) {
        const resultText = formatResultText(path, data.pages, data.totalCount, limit, page);
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
      logToStderr(`Direct request failed: ${directError instanceof Error ? directError.message : String(directError)}`);
      // エラーの場合はここでcatchして、次の処理に進む
    }
    
    // GrowiClientを使用したフォールバック処理
    const response = await client.listPages(path, limit, page);

    // Log more detailed response info for debugging
    logToStderr(`GROWI API response details:`, {
      ok: response.ok,
      pagesCount: response.pages?.length || 0,
      hasError: response.error ? true : false,
      error: response.error || 'none',
      meta: response.meta || 'none'
    });

    if (!response.ok) {
      console.error(`GROWI API returned error: ${response.error || 'Unknown error'}`);
      return {
        content: [
          {
            type: 'text',
            text: `Error listing pages (path: ${path}, offset: ${(page-1) * limit}): ${response.error || 'Unknown error'}`,
          },
        ],
      };
    }

    logToStderr(`GROWI API returned ${response.pages?.length || 0} pages`);

    const resultText = formatResultText(
      path,
      response.pages,
      response.meta?.total,
      limit,
      page,
    );

    return {
      content: [
        {
          type: 'text',
          text: resultText,
        },
      ],
    };
  } catch (error) {
    console.error('Exception in listPages tool:', error);
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