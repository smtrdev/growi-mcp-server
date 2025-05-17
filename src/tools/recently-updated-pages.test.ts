import { jest } from '@jest/globals';
import { recentlyUpdatedPages } from './recently-updated-pages.js';

describe('recentlyUpdatedPages', () => {
  it('formats result text with page paths', async () => {
    const mockClient = {
      getRecentlyUpdatedPages: jest.fn(async () => ({
        ok: true,
        pages: [
          { path: '/recent' } as any,
        ],
        meta: { total: 1, limit: 20, offset: 0 },
      })),
    } as any;

    const result = await recentlyUpdatedPages(mockClient, {});

    expect(result.content[0].text).toContain('/recent');
  });
});

