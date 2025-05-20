import { z } from 'zod';
import { GrowiClient } from '../growi-client.js';
import { GrowiPage } from '../types/growi.js';
import { makeNativeHttpRequest } from './native-request.js';

const logToStderr = (...args: any[]) => {
  console.error(...args);
};

export const recentlyUpdatedPagesSchema = z.object({
  limit: z.union([z.string(), z.number()]).optional().describe('Maximum number of pages to return (default: 20)'),
  offset: z.union([z.string(), z.number()]).optional().describe('Offset for pagination (default: 0)'),
});

export type RecentlyUpdatedPagesParams = z.infer<typeof recentlyUpdatedPagesSchema>;


export async function recentlyUpdatedPages(
  client: GrowiClient,
  params: RecentlyUpdatedPagesParams
): Promise<{ content: { type: string; text: string }[] }> {
  try {
    let limit = 20;
    let offset = 0;

    if (params) {
      if (params.limit !== undefined) {
        if (typeof params.limit === 'string') {
          limit = parseInt(params.limit, 10);
          logToStderr(`Converted string limit to number: ${limit}`);
        } else {
          limit = params.limit;
        }
        if (isNaN(limit) || limit < 1) {
          limit = 20;
          logToStderr(`Invalid limit value, reset to default: ${limit}`);
        }
      }

      if (params.offset !== undefined) {
        if (typeof params.offset === 'string') {
          offset = parseInt(params.offset, 10);
          logToStderr(`Converted string offset to number: ${offset}`);
        } else {
          offset = params.offset;
        }
        if (isNaN(offset) || offset < 0) {
          offset = 0;
          logToStderr(`Invalid offset value, reset to default: ${offset}`);
        }
      }
    } else {
      logToStderr('No parameters provided, using defaults');
    }

    logToStderr(`Calling GROWI API with: limit=${limit}, offset=${offset}`);

    try {
      const apiUrl = (client as any).baseURL;
      const apiToken = (client as any).apiToken;

      if (!apiUrl || !apiToken) {
        throw new Error('Missing API URL or token');
      }

      const url = new URL(`${apiUrl}/_api/v3/pages/recent`);
      url.searchParams.append('limit', String(limit));
      url.searchParams.append('offset', String(offset));

      const urlString = url.toString();

      const data = await makeNativeHttpRequest(urlString, apiToken);

      if (data && data.pages) {
        const pagesCount = data.pages.length || 0;
        let resultText = '';
        if (pagesCount === 0) {
          resultText = 'No recently updated pages found';
        } else {
          resultText = `Found ${pagesCount} recently updated pages\n\n`;
          data.pages.forEach((page: any, index: number) => {
            if (index < 10) logToStderr(`  - Page ${index+1}: ${page.path}`);
            resultText += `- ${page.path}\n`;
          });
          if (pagesCount > 10) {
            logToStderr(`  - ... and ${pagesCount - 10} more pages`);
          }
          resultText += `\nShowing ${offset + 1}-${offset + pagesCount}`;
          if (typeof data.totalCount === 'number') {
            resultText += ` of ${data.totalCount} total pages`;
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
      }
    } catch (directError) {
      logToStderr(`Direct request failed: ${directError instanceof Error ? directError.message : String(directError)}`);
    }

    const response = await client.getRecentlyUpdatedPages(limit, offset);

    logToStderr(`GROWI API returned ${response.pages?.length || 0} pages`);
    let resultText = '';

    if (!response.ok) {
      return {
        content: [
          {
            type: 'text',
            text: `Error listing recently updated pages: ${response.error || 'Unknown error'}`,
          },
        ],
      };
    }

    if (!response.pages || response.pages.length === 0) {
      resultText = 'No recently updated pages found';
    } else {
      resultText = `Found ${response.pages.length} recently updated pages\n\n`;
      response.pages.forEach((page: GrowiPage, index: number) => {
        if (index < 10) logToStderr(`  - Page ${index+1}: ${page.path}`);
        resultText += `- ${page.path}\n`;
      });
      if (response.pages.length > 10) {
        logToStderr(`  - ... and ${response.pages.length - 10} more pages`);
      }
      if (response.meta) {
        resultText += `\nShowing ${response.meta.offset + 1}-${response.meta.offset + response.pages.length}`;
        resultText += ` of ${response.meta.total} total pages`;
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
    console.error('Exception in recentlyUpdatedPages tool:', error);
    return {
      content: [
        {
          type: 'text',
          text: `Error listing recently updated pages: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}

