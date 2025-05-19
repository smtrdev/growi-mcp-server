import { jest } from '@jest/globals';
import { searchPages } from './search-pages.js';

describe('searchPages', () => {
  it('formats result text with paths', async () => {
    const mockClient = {
      searchPages: jest.fn(async () => ({
        ok: true,
        data: [{ path: '/result' }],
        meta: { total: 1, took: 0, hitsCount: 1 }
      }))
    } as any;

    const result = await searchPages(mockClient, { query: 'result' });

    expect(result.content[0].text).toContain('/result');
  });
});
