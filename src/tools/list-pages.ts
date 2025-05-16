import { z } from 'zod';
import { GrowiClient } from '../growi-client.js';
import { GrowiPage } from '../types/growi.js';

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

export async function listPages(
  client: GrowiClient,
  params: ListPagesParams
): Promise<{ content: { type: string; text: string }[] }> {
  try {
    logToStderr('📥 listPages tool called with params:', JSON.stringify(params, null, 2));
    
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
        logToStderr(`📝 Normalized path parameter: "${path}"`);
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