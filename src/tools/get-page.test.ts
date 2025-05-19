import { jest } from '@jest/globals';
import { getPage } from './get-page.js';

describe('getPage', () => {
  it('formats result text with page path', async () => {
    const mockClient = {
      getPage: jest.fn(async () => ({
        ok: true,
        page: { path: '/test', revision: { body: 'hello', author: { _id: '', name: '' }, _id: '', createdAt: '' }, creator: { _id: '', name: '' }, _id: '', createdAt: '', updatedAt: '' }
      })),
    } as any;

    const result = await getPage(mockClient, { path: '/test' });

    expect(result.content[0].text).toContain('/test');
  });
});
