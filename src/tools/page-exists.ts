import { z } from 'zod';
import https from 'https';
import http from 'http';
import { URL } from 'url';
import { GrowiClient } from '../growi-client.js';

const logToStderr = (...args: any[]) => {
  console.error(...args);
};

export const pageExistsSchema = z.object({
  path: z.string().describe('Path of the page to check'),
});

export type PageExistsParams = z.infer<typeof pageExistsSchema>;

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

export async function pageExists(
  client: GrowiClient,
  params: PageExistsParams
): Promise<{ content: { type: string; text: string }[] }> {
  try {
    const parsed = pageExistsSchema.parse(params);
    let path = parsed.path;
    if (!path.startsWith('/')) path = '/' + path;

    try {
      const apiUrl = (client as any).baseURL;
      const apiToken = (client as any).apiToken;

      if (!apiUrl || !apiToken) {
        throw new Error('Missing API URL or token');
      }

      const url = new URL(`${apiUrl}/_api/v3/page/exist`);
      url.searchParams.append('path', path);

      const data = await makeNativeHttpRequest(url.toString(), apiToken);

      if (data && typeof data.ok === 'boolean') {
        const text = data.ok ? `Page exists: ${path}` : `Page not found: ${path}`;
        return { content: [{ type: 'text', text }] };
      }
    } catch (directError) {
      logToStderr(`Direct request failed: ${directError instanceof Error ? directError.message : String(directError)}`);
    }

    const response = await client.pageExists(path);

    if (!response.ok) {
      return {
        content: [
          { type: 'text', text: `Error checking page: ${response.error || 'Unknown error'}` },
        ],
      };
    }

    const text = response.exists ? `Page exists: ${path}` : `Page not found: ${path}`;
    return { content: [{ type: 'text', text }] };
  } catch (error) {
    console.error('Exception in pageExists tool:', error);
    return {
      content: [
        { type: 'text', text: `Error checking page: ${error instanceof Error ? error.message : String(error)}` },
      ],
    };
  }
}
