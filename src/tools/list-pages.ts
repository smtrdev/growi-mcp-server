import { z } from 'zod';
import { GrowiClient } from '../growi-client.js';
import { GrowiPage } from '../types/growi.js';

export const listPagesSchema = z.object({
  path: z.string().optional().describe('Path prefix to list pages from (default: /)'),
  limit: z.number().optional().describe('Maximum number of pages to return (default: 100)'),
  offset: z.number().optional().describe('Number of pages to skip (default: 0)'),
});

export type ListPagesParams = z.infer<typeof listPagesSchema>;

export async function listPages(
  client: GrowiClient,
  params: ListPagesParams
): Promise<{ content: { type: string; text: string }[] }> {
  try {
    const { path = '/', limit = 100, offset = 0 } = params;
    const response = await client.listPages(path, limit, offset);

    if (!response.ok) {
      return {
        content: [
          {
            type: 'text',
            text: `Error listing pages: ${(response as any).error || 'Unknown error'}`,
          },
        ],
      };
    }

    let resultText = '';
    
    if (response.pages.length === 0) {
      resultText = `No pages found under path: ${path}`;
    } else {
      resultText = `Found ${response.pages.length} pages under path: ${path}\n\n`;
      response.pages.forEach((page: GrowiPage) => {
        resultText += `- ${page.path}\n`;
      });

      if (response.meta) {
        resultText += `\nShowing ${offset + 1}-${Math.min(offset + response.pages.length, response.meta.total)} of ${response.meta.total} total pages`;
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