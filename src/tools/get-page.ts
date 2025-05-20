import { z } from 'zod';
import { makeNativeHttpRequest } from './native-request.js';
import { GrowiClient } from '../growi-client.js';

const logToStderr = (...args: any[]) => {
  console.error(...args);
};

export const getPageSchema = z.object({
  path: z.string().describe('Path of the page to retrieve'),
});

export type GetPageParams = z.infer<typeof getPageSchema>;


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

