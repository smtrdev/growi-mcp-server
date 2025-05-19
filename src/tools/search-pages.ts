import { z } from 'zod';
import https from 'https';
import http from 'http';
import { URL } from 'url';
import { GrowiClient } from '../growi-client.js';

const logToStderr = (...args: any[]) => {
  console.error(...args);
};

export const searchPagesSchema = z.object({
  query: z.string().describe('Search query string'),
  limit: z.union([z.number(), z.string()]).optional().describe('Number of results to return (default: 20)'),
  offset: z.union([z.number(), z.string()]).optional().describe('Offset for pagination (default: 0)'),
});

export type SearchPagesParams = z.infer<typeof searchPagesSchema>;

function makeNativeHttpRequest(url: string, apiToken: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    logToStderr(`Making native HTTP request to: ${url}`);

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

    logToStderr(`Sending access_token in request body: ${apiToken.substring(0,5)}...`);

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

    req.write(postData);
    req.end();
  });
}

export async function searchPages(
  client: GrowiClient,
  params: SearchPagesParams
): Promise<{ content: { type: string; text: string }[] }> {
  try {
    const parsed = searchPagesSchema.parse(params);
    const query = parsed.query;
    let limit = parsed.limit !== undefined ? Number(parsed.limit) : 20;
    if (isNaN(limit) || limit < 1) limit = 20;
    let offset = parsed.offset !== undefined ? Number(parsed.offset) : 0;
    if (isNaN(offset) || offset < 0) offset = 0;

    try {
      const apiUrl = (client as any).baseURL;
      const apiToken = (client as any).apiToken;

      if (!apiUrl || !apiToken) {
        throw new Error('Missing API URL or token');
      }

      const url = new URL(`${apiUrl}/_api/v3/search`);
      url.searchParams.append('q', query);
      url.searchParams.append('limit', String(limit));
      url.searchParams.append('offset', String(offset));

      const data = await makeNativeHttpRequest(url.toString(), apiToken);

      if (data && Array.isArray(data.data)) {
        const count = data.data.length;
        let text = `Found ${count} pages for query: ${query}\n\n`;
        data.data.forEach((p: any) => {
          text += `- ${p.path}\n`;
        });
        return { content: [{ type: 'text', text }] };
      }
    } catch (directError) {
      logToStderr(`Direct request failed: ${directError instanceof Error ? directError.message : String(directError)}`);
    }

    const response = await client.searchPages(query, limit, offset);

    if (!response.ok) {
      return {
        content: [
          { type: 'text', text: `Error searching pages: ${response.error || 'Unknown error'}` },
        ],
      };
    }

    const count = response.data.length;
    let text = `Found ${count} pages for query: ${query}\n\n`;
    response.data.forEach((p) => {
      text += `- ${p.path}\n`;
    });

    return { content: [{ type: 'text', text }] };
  } catch (error) {
    console.error('Exception in searchPages tool:', error);
    return {
      content: [
        { type: 'text', text: `Error searching pages: ${error instanceof Error ? error.message : String(error)}` },
      ],
    };
  }
}
