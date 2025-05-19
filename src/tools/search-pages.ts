import { z } from 'zod';
import https from 'https';
import http from 'http';
import { URL } from 'url';
import { GrowiClient } from '../growi-client.js';

const logToStderr = (...args: any[]) => {
  console.error(...args);
};

export const searchPagesSchema = z.object({
  query: z.string().describe('Keyword to search for'),
  limit: z.union([z.string(), z.number()]).optional().describe('Maximum number of results (default: 20)'),
  offset: z.union([z.string(), z.number()]).optional().describe('Offset for pagination (default: 0)'),
});

export type SearchPagesParams = z.infer<typeof searchPagesSchema>;

function makeNativeHttpRequest(url: string, apiToken: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
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

    const protocol = parsedUrl.protocol === 'https:' ? https : http;
    const req = protocol.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk.toString());
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error(`Failed to parse JSON: ${e instanceof Error ? e.message : String(e)}`));
          }
        } else {
          reject(new Error(`HTTP Error: ${res.statusCode} ${res.statusMessage || ''} - ${data}`));
        }
      });
    });
    req.on('error', err => reject(err));
    req.write(postData);
    req.end();
  });
}

function formatResult(query: string, results: any[]): string {
  if (!results || results.length === 0) return `No pages found for query: ${query}`;

  let text = `Search results for \"${query}\"\n\n`;
  results.forEach(r => {
    text += `- ${r.path}\n`;
  });
  return text;
}

export async function searchPages(client: GrowiClient, params: SearchPagesParams): Promise<{ content: { type: string; text: string }[] }> {
  try {
    const parsed = searchPagesSchema.parse(params);
    const query = parsed.query;
    const limit = parsed.limit !== undefined ? Number(parsed.limit) : 20;
    const offset = parsed.offset !== undefined ? Number(parsed.offset) : 0;

    try {
      const apiUrl = (client as any).baseURL;
      const apiToken = (client as any).apiToken;
      if (!apiUrl || !apiToken) throw new Error('Missing API URL or token');

      const url = new URL(`${apiUrl}/_api/v3/search`);
      url.searchParams.append('q', query);
      url.searchParams.append('limit', String(limit));
      url.searchParams.append('offset', String(offset));

      const data = await makeNativeHttpRequest(url.toString(), apiToken);
      if (data && data.data) {
        return { content: [{ type: 'text', text: formatResult(query, data.data) }] };
      }
    } catch (directError) {
      logToStderr(`Direct request failed: ${directError instanceof Error ? directError.message : String(directError)}`);
    }

    const response = await client.searchPages(query, limit, offset);
    if (!response.ok) {
      return { content: [{ type: 'text', text: `Error searching pages: ${response.error || 'Unknown error'}` }] };
    }
    return { content: [{ type: 'text', text: formatResult(query, response.data) }] };
  } catch (error) {
    console.error('Exception in searchPages tool:', error);
    return { content: [{ type: 'text', text: `Error searching pages: ${error instanceof Error ? error.message : String(error)}` }] };
  }
}
