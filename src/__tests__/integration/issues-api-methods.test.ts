/**
 * Integration Tests for IssuesAPIClient Methods
 * Tests actual method logic with mocked axios responses
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { IssuesAPIClient } from '../../api/domains/issues-api.js';
import type { IssueCreateParams, IssueUpdateParams, IssueQueryParams } from '../../api/domains/issues-api.js';
import type { YouTrackConfig } from '../../api/base/base-client.js';

describe('IssuesAPIClient - Method Logic Tests', () => {
  let client: IssuesAPIClient;
  let mockPost: any;
  let mockGet: any;
  let mockDelete: any;

  beforeEach(() => {
    const config: YouTrackConfig = {
      baseURL: 'https://youtrack.test.com',
      token: 'test-token-123',
    };
    
    client = new IssuesAPIClient(config);
    
    // Mock the axios methods
    mockPost = jest.spyOn((client as any).axios, 'post');
    mockGet = jest.spyOn((client as any).axios, 'get');
    mockDelete = jest.spyOn((client as any).axios, 'delete');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('createIssue', () => {
    test('should create issue with basic fields', async () => {
      const mockIssueData = {
        id: 'TEST-1',
        idReadable: 'TEST-1',
        summary: 'Test Issue',
      };

      mockPost.mockResolvedValue({
        data: mockIssueData,
        status: 200,
      });

      const params: IssueCreateParams = {
        summary: 'Test Issue',
        description: 'Test Description',
      };

      const result = await client.createIssue('TEST', params);

      expect(mockPost).toHaveBeenCalledWith(
        '/issues',
        expect.objectContaining({
          summary: 'Test Issue',
          description: 'Test Description',
        }),
        expect.any(Object)
      );
      
      expect(result).toHaveProperty('content');
      expect(result.content[0].text).toContain('TEST-1');
    });

    test('should handle project shortName vs ID', async () => {
      mockPost.mockResolvedValue({
        data: { id: 'TEST-1' },
        status: 200,
      });

      await client.createIssue('MYPROJECT', { summary: 'Test' });

      const callArgs = mockPost.mock.calls[0][1];
      expect(callArgs.project).toHaveProperty('shortName', 'MYPROJECT');
    });

    test('should handle internal project ID format', async () => {
      mockPost.mockResolvedValue({
        data: { id: 'TEST-1' },
        status: 200,
      });

      await client.createIssue('0-2', { summary: 'Test' });

      const callArgs = mockPost.mock.calls[0][1];
      expect(callArgs.project).toHaveProperty('id', '0-2');
    });

    test('should sanitize description', async () => {
      mockPost.mockResolvedValue({
        data: { id: 'TEST-1' },
        status: 200,
      });

      await client.createIssue('TEST', {
        summary: 'Test',
        description: '<script>alert("xss")</script>Normal text',
      });

      const callArgs = mockPost.mock.calls[0][1];
      expect(callArgs.description).not.toContain('<script>');
      expect(callArgs.description).toContain('Normal text');
    });

    test('should handle project not found error', async () => {
      mockPost.mockRejectedValue({
        message: '404 not found',
        response: { status: 404 },
      });

      const result = await client.createIssue('INVALID', { summary: 'Test' });

      expect(result.content[0].text).toContain('not found');
      expect(result.content[0].text).toContain('INVALID');
    });

    test('should handle permission error', async () => {
      mockPost.mockRejectedValue({
        message: '403 Forbidden',
        response: { status: 403 },
      });

      const result = await client.createIssue('TEST', { summary: 'Test' });

      expect(result.content[0].text).toContain('permission');
    });
  });

  describe('getIssue', () => {
    test('should fetch single issue', async () => {
      const mockIssue = {
        id: 'TEST-1',
        idReadable: 'TEST-1',
        summary: 'Test Issue',
        description: 'Description',
      };

      mockGet.mockResolvedValue({
        data: mockIssue,
        status: 200,
      });

      const result = await client.getIssue('TEST-1');

      expect(mockGet).toHaveBeenCalledWith(
        '/issues/TEST-1',
        expect.objectContaining({
          params: expect.objectContaining({
            fields: expect.any(String),
          }),
        })
      );
      
      expect(result.content[0].text).toContain('TEST-1');
    });

    test('should use custom fields parameter', async () => {
      mockGet.mockResolvedValue({
        data: { id: 'TEST-1' },
        status: 200,
      });

      await client.getIssue('TEST-1', 'id,summary,description');

      expect(mockGet).toHaveBeenCalledWith(
        '/issues/TEST-1',
        expect.objectContaining({
          params: expect.objectContaining({
            fields: 'id,summary,description',
          }),
        })
      );
    });

    test('should handle issue not found', async () => {
      mockGet.mockRejectedValue({
        message: 'Issue not found',
        response: { status: 404 },
      });

      const result = await client.getIssue('NONEXISTENT-1');

      expect(result.content[0].text).toContain('not found');
    });
  });

  describe('queryIssues', () => {
    test('should query issues with filter', async () => {
      const mockIssues = [
        { id: 'TEST-1', summary: 'Issue 1' },
        { id: 'TEST-2', summary: 'Issue 2' },
      ];

      mockGet.mockResolvedValue({
        data: mockIssues,
        status: 200,
      });

      const params: IssueQueryParams = {
        query: 'project: TEST State: Open',
        limit: 50,
      };

      const result = await client.queryIssues(params);

      expect(mockGet).toHaveBeenCalledWith(
        '/issues',
        expect.objectContaining({
          params: expect.objectContaining({
            query: 'project: TEST State: Open',
            $top: 50,
          }),
        })
      );

      expect(result.content[0].text).toContain('2');
    });

    test('should handle empty results', async () => {
      mockGet.mockResolvedValue({
        data: [],
        status: 200,
      });

      const result = await client.queryIssues({ query: 'project: EMPTY' });

      expect(result.content[0].text).toContain('0');
    });

    test('should apply skip parameter for pagination', async () => {
      mockGet.mockResolvedValue({
        data: [],
        status: 200,
      });

      await client.queryIssues({ query: 'project: TEST', skip: 10 });

      expect(mockGet).toHaveBeenCalledWith(
        '/issues',
        expect.objectContaining({
          params: expect.objectContaining({
            $skip: 10,
          }),
        })
      );
    });
  });

  describe('updateIssue', () => {
    test('should update basic fields', async () => {
      mockPost.mockResolvedValue({
        data: { success: true },
        status: 200,
      });
      
      mockGet.mockResolvedValue({
        data: {
          id: 'TEST-1',
          summary: 'Updated Summary',
        },
        status: 200,
      });

      const updates: IssueUpdateParams = {
        summary: 'Updated Summary',
        description: 'Updated Description',
      };

      await client.updateIssue('TEST-1', updates);

      expect(mockPost).toHaveBeenCalledWith(
        '/issues/TEST-1',
        expect.objectContaining({
          summary: 'Updated Summary',
        }),
        expect.any(Object)
      );
    });

    test('should use commands for state/priority/type changes', async () => {
      mockPost.mockResolvedValue({
        data: { success: true },
        status: 200,
      });

      mockGet.mockResolvedValue({
        data: { id: 'TEST-1' },
        status: 200,
      });

      await client.updateIssue('TEST-1', {
        state: 'In Progress',
        priority: 'High',
        type: 'Bug',
      });

      // Should call commands endpoint
      expect(mockPost).toHaveBeenCalledWith(
        '/issues/TEST-1/commands',
        expect.objectContaining({
          query: expect.stringContaining('State: In Progress'),
        }),
        expect.any(Object)
      );

      // Verify correct command syntax with colons
      const commandCall = mockPost.mock.calls.find((call: any) => 
        call[0] === '/issues/TEST-1/commands'
      );
      expect(commandCall[1].query).toContain('State: In Progress');
      expect(commandCall[1].query).toContain('Priority: High');
      expect(commandCall[1].query).toContain('Type: Bug');
    });

    test('should sanitize description in update', async () => {
      mockPost.mockResolvedValue({
        data: { success: true },
        status: 200,
      });

      mockGet.mockResolvedValue({
        data: { id: 'TEST-1' },
        status: 200,
      });

      await client.updateIssue('TEST-1', {
        description: '<script>bad</script>Good text',
      });

      const callArgs = mockPost.mock.calls[0][1];
      expect(callArgs.description).not.toContain('<script>');
      expect(callArgs.description).toContain('Good text');
    });
  });

  describe('deleteIssue', () => {
    test('should delete issue', async () => {
      mockDelete.mockResolvedValue({
        data: null,
        status: 204,
      });

      const result = await client.deleteIssue('TEST-1');

      expect(mockDelete).toHaveBeenCalledWith('/issues/TEST-1');
      expect(result.content[0].text).toContain('deleted');
    });

    test('should handle delete error', async () => {
      mockDelete.mockRejectedValue({
        message: 'Cannot delete',
        response: { status: 403 },
      });

      const result = await client.deleteIssue('TEST-1');

      expect(result.content[0].text).toContain('error');
    });
  });

  describe('changeIssueState', () => {
    test('should change state with comment', async () => {
      mockPost.mockResolvedValue({
        data: { success: true },
        status: 200,
      });

      await client.changeIssueState('TEST-1', 'Fixed', 'Testing completed');

      expect(mockPost).toHaveBeenCalledWith(
        '/issues/TEST-1/commands',
        expect.objectContaining({
          query: 'State: Fixed',
          comment: 'Testing completed',
        }),
        expect.any(Object)
      );
    });

    test('should use correct command syntax with colon', async () => {
      mockPost.mockResolvedValue({
        data: { success: true },
        status: 200,
      });

      await client.changeIssueState('TEST-1', 'Resolved');

      const callArgs = mockPost.mock.calls[0][1];
      expect(callArgs.query).toBe('State: Resolved');
      expect(callArgs.query).not.toMatch(/State\s+Resolved/); // No space without colon
    });
  });

  describe('linkIssues', () => {
    test('should create issue link', async () => {
      mockPost.mockResolvedValue({
        data: { success: true },
        status: 200,
      });

      await client.linkIssues('TEST-1', 'TEST-2', 'relates to');

      expect(mockPost).toHaveBeenCalledWith(
        '/issues/TEST-1/links',
        expect.objectContaining({
          linkTypeName: 'relates to',
          issues: expect.arrayContaining([
            expect.objectContaining({ id: 'TEST-2' }),
          ]),
        }),
        expect.any(Object)
      );
    });

    test('should handle different link types', async () => {
      mockPost.mockResolvedValue({
        data: { success: true },
        status: 200,
      });

      await client.linkIssues('TEST-1', 'TEST-3', 'depends on');

      const callArgs = mockPost.mock.calls[0][1];
      expect(callArgs.linkTypeName).toBe('depends on');
    });
  });

  describe('addComment', () => {
    test('should add comment to issue', async () => {
      mockGet.mockResolvedValue({ data: { id: '2-1' }, status: 200 });
      mockPost.mockResolvedValue({
        data: {
          id: 'comment-1',
          text: 'Test comment',
          author: { login: 'test.user' },
        },
        status: 200,
      });

      const result = await client.addComment('TEST-1', 'Test comment');

      expect(mockGet).toHaveBeenCalledWith('/issues/TEST-1', expect.objectContaining({ params: expect.objectContaining({ fields: 'id' }) }));
      expect(mockPost).toHaveBeenCalledWith(
        expect.stringMatching(/^\/issues\/2-1\/comments(\?|$)/),
        expect.objectContaining({
          text: 'Test comment',
        })
      );

      expect(result.content[0].text).toContain('comment');
    });

    test('should use internal id for readable issue id so comment is created on correct issue', async () => {
      mockGet
        .mockResolvedValueOnce({ data: { id: '2-6225' }, status: 200 })
        .mockResolvedValueOnce({
          data: [
            { id: '4-7985', text: 'Existing comment', author: { login: 'other' }, created: 1 },
            { id: '4-7999', text: 'New comment from add', author: { login: 'me' }, created: 2 },
          ],
          status: 200,
        });
      mockPost.mockResolvedValue({
        data: { id: '4-7999', text: 'New comment from add', author: { login: 'me' }, created: 2 },
        status: 200,
      });

      const addResult = await client.addComment('911C-2937', 'New comment from add');
      expect(addResult.content[0].text).toContain('Comment added successfully');

      const listResult = await client.getIssueComments('911C-2937');
      const parsed = JSON.parse(listResult.content[0].text);
      const items = parsed.data?.items ?? parsed.items ?? [];
      const added = items.find((c: any) => c.text === 'New comment from add');
      expect(added).toBeDefined();
      expect(added.id).toBe('4-7999');

      expect(mockPost).toHaveBeenCalledWith(
        expect.stringContaining('/issues/2-6225/comments'),
        expect.objectContaining({ text: 'New comment from add' })
      );
    });

    test('should sanitize comment text', async () => {
      mockGet.mockResolvedValue({ data: { id: '2-1' }, status: 200 });
      mockPost.mockResolvedValue({
        data: { id: 'c1', text: 'Safe' },
        status: 200,
      });

      await client.addComment('TEST-1', '<script>alert(1)</script>Safe text');

      const callArgs = mockPost.mock.calls[0][1];
      expect(callArgs.text).not.toContain('<script>');
      expect(callArgs.text).toContain('Safe text');
    });
  });

  describe('Error Handling', () => {
    test('should handle network errors', async () => {
      mockGet.mockRejectedValue(new Error('Network error'));

      const result = await client.getIssue('TEST-1');

      expect(result.content[0].text).toContain('error');
    });

    test('should handle malformed responses', async () => {
      mockGet.mockResolvedValue({
        data: null,
        status: 200,
      });

      const result = await client.getIssue('TEST-1');

      expect(result).toHaveProperty('content');
    });

    test('should handle timeout errors', async () => {
      mockPost.mockRejectedValue({
        message: 'timeout of 30000ms exceeded',
        code: 'ECONNABORTED',
      });

      const result = await client.createIssue('TEST', { summary: 'Test' });

      expect(result.content[0].text).toContain('error');
    });
  });

  describe('Comment add then fetch (911C-2937) - live integration', () => {
    const issueId = '911C-2937';
    const hasEnv = !!(process.env.YOUTRACK_URL && process.env.YOUTRACK_TOKEN);
    const runLive = hasEnv ? test : test.skip;

    runLive('add comment then fetch returns the new comment on the issue', async () => {
      const liveClient = new IssuesAPIClient({
        baseURL: process.env.YOUTRACK_URL!,
        token: process.env.YOUTRACK_TOKEN!,
      });
      const uniqueText = `MCP test comment at ${Date.now()}`;
      const addResult = await liveClient.addComment(issueId, uniqueText);
      const addParsed = JSON.parse(addResult.content[0].text);
      expect(addParsed.success).toBe(true);

      const listResult = await liveClient.getIssueComments(issueId);
      const listParsed = JSON.parse(listResult.content[0].text);
      const items = listParsed.data?.items ?? listParsed.items ?? [];
      const found = items.find((c: any) => c.text === uniqueText);
      expect(found).toBeDefined();
      expect(found?.id).toBeDefined();
    });
  });
});
