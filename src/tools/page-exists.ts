import { z } from 'zod';
import https from 'https';
import http from 'http';
import { URL } from 'url';
import { GrowiClient } from '../growi-client.js';

const logToStderr = (...args: any[]) => console.error(...args);

export const pageExistsSchema = z.object({
  path: z.string().describe('Path of the page to check'),
});

export type PageExistsParams = z.infer<typeof pageExistsSchema>;

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

export async function pageExists(client: GrowiClient, params: PageExistsParams): Promise<{ content: { type: string; text: string }[] }> {
  try {
    const parsed = pageExistsSchema.parse(params);
    let path = parsed.path;
    if (!path.startsWith('/')) path = '/' + path;

    try {
      const apiUrl = (client as any).baseURL;
      const apiToken = (client as any).apiToken;
      if (!apiUrl || !apiToken) throw new Error('Missing API URL or token');

      const url = new URL(`${apiUrl}/_api/v3/page/exist`);
      url.searchParams.append('path', path);

      const data = await makeNativeHttpRequest(url.toString(), apiToken);
      if (data && typeof data.exist !== 'undefined') {
        return { content: [{ type: 'text', text: data.exist ? `Page exists: ${path}` : `Page not found: ${path}` }] };
      }
    } catch (directError) {
      logToStderr(`Direct request failed: ${directError instanceof Error ? directError.message : String(directError)}`);
    }

    const response = await client.pageExists(path);
    if (!response.ok) {
      return { content: [{ type: 'text', text: `Error checking page: ${response.error || 'Unknown error'}` }] };
    }
    return { content: [{ type: 'text', text: response.exists ? `Page exists: ${path}` : `Page not found: ${path}` }] };
  } catch (error) {
    console.error('Exception in pageExists tool:', error);
    return { content: [{ type: 'text', text: `Error checking page: ${error instanceof Error ? error.message : String(error)}` }] };
  }
}
