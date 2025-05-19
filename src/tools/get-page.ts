import { z } from 'zod';
import https from 'https';
import http from 'http';
import { URL } from 'url';
import { GrowiClient } from '../growi-client.js';

const logToStderr = (...args: any[]) => {
  console.error(...args);
};

export const getPageSchema = z.object({
  path: z.string().describe('Path of the page to retrieve'),
});

export type GetPageParams = z.infer<typeof getPageSchema>;

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
            if (jsonData.page && jsonData.page.revision) {
              const bodyLength = jsonData.page.revision.body ? jsonData.page.revision.body.length : 0;
              logToStderr(`Got page with content length: ${bodyLength} characters`);
              if (bodyLength > 0) {
                const preview = jsonData.page.revision.body.substring(0, 100);
                logToStderr(`Content preview: ${preview}...`);
              }
            }
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

export async function getPage(
  client: GrowiClient,
  params: GetPageParams
): Promise<{ content: { type: string; text: string }[] }> {
  try {
    const parsed = getPageSchema.parse(params);
    let path = parsed.path;
    if (!path.startsWith('/')) path = '/' + path;

    try {
      const apiUrl = (client as any).baseURL;
      const apiToken = (client as any).apiToken;

      if (!apiUrl || !apiToken) {
        throw new Error('Missing API URL or token');
      }

      const url = new URL(`${apiUrl}/_api/v3/page`);
      url.searchParams.append('path', path);

      logToStderr(`Fetching page at path: ${path}`);
      const data = await makeNativeHttpRequest(url.toString(), apiToken);

      if (data && data.page) {
        let text = `Page: ${data.page.path}\n\n`;
        if (data.page.revision?.body) {
          const fullBody = data.page.revision.body;
          logToStderr(`Full page body length: ${fullBody.length} characters`);
          text += fullBody;
          logToStderr(`Response text length (after adding to text): ${text.length} characters`);
        } else {
          logToStderr(`Warning: No revision body found for page: ${path}`);
        }
        const resultObj = { content: [{ type: 'text', text }] };
        logToStderr(`Final result object: ${JSON.stringify(resultObj).substring(0, 150)}...`);
        return resultObj;
      } else {
        logToStderr(`API returned data but without page content: ${JSON.stringify(data).substring(0, 200)}...`);
      }
    } catch (directError) {
      logToStderr(`Direct request failed: ${directError instanceof Error ? directError.message : String(directError)}`);
    }

    logToStderr(`Falling back to client.getPage method for path: ${path}`);
    const response = await client.getPage(path);

    if (!response.ok) {
      logToStderr(`Client getPage failed: ${response.error}`);
      return {
        content: [
          {
            type: 'text',
            text: `Error getting page: ${response.error || 'Unknown error'}`,
          },
        ],
      };
    }

    let text = `Page: ${response.page.path}\n\n`;
    if (response.page.revision?.body) {
      const fullBody = response.page.revision.body;
      logToStderr(`Client method: Full page body length: ${fullBody.length} characters`);
      text += fullBody;
    } else {
      logToStderr(`Client method: Warning: No revision body found for page: ${path}`);
    }

    const resultObj = { content: [{ type: 'text', text }] };
    logToStderr(`Client method: Final result object: ${JSON.stringify(resultObj).substring(0, 150)}...`);
    return resultObj;
  } catch (error) {
    console.error('Exception in getPage tool:', error);
    return {
      content: [
        {
          type: 'text',
          text: `Error getting page: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}

