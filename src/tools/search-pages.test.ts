import { jest } from '@jest/globals';
import { searchPages } from './search-pages.js';

describe('searchPages', () => {
  it('returns list text containing query', async () => {
    const mockClient = {
      searchPages: jest.fn(async () => ({
        ok: true,
        data: [{ path: '/test' }],
        meta: { total: 1, took: 0, hitsCount: 1 }
      }))
    } as any;

    const result = await searchPages(mockClient, { query: 'test' });

    expect(result.content[0].text).toContain('test');
    expect(result.content[0].text).toContain('/test');
  });
});
