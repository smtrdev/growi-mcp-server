import { jest } from '@jest/globals';
import { listPages } from './list-pages.js';

describe('listPages', () => {
  it('formats result text with page paths', async () => {
    const mockClient = {
      listPages: jest.fn(async () => ({
        ok: true,
        pages: [
          { path: '/test' } as any,
        ],
        meta: { total: 1, limit: 100, offset: 0 },
      })),
    } as any;

    const result = await listPages(mockClient, { path: '/test' });

    expect(result.content[0].text).toContain('/test');
  });
});
