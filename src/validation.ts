import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { logger } from './logger.js';

/**
 * Validation utilities for MCP tool parameters
 */
export class ValidationError extends Error {
  constructor(message: string, public field?: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class ParameterValidator {
  /**
   * Validate project ID format
   */
  static validateProjectId(projectId: string | undefined, fieldName = 'projectId'): string {
    if (!projectId) {
      throw new ValidationError(`${fieldName} is required`, fieldName);
    }

    // YouTrack project IDs can be:
    // - Short names: PROJECT, DEMO, TEST-1
    // - Internal IDs: 0-1, 0-18, 3-32
    const projectIdPattern = /^([A-Z][A-Z0-9]*(-[A-Z0-9]+)*|\d+-\d+)$/i;
    
    if (!projectIdPattern.test(projectId)) {
      throw new ValidationError(
        `Invalid ${fieldName} format: '${projectId}'. Must be a project short name (e.g., 'PROJECT', 'TEST-1') or internal ID (e.g., '0-1', '3-32')`,
        fieldName
      );
    }

    return projectId;
  }

  /**
   * Validate issue ID format
   */
  static validateIssueId(issueId: string | undefined, fieldName = 'issueId'): string {
    if (!issueId) {
      throw new ValidationError(`${fieldName} is required`, fieldName);
    }

    // YouTrack issue IDs: PROJECT-123, 911C-2937, TEST-1, 3-511
    const issueIdPattern = /^([A-Z0-9][A-Z0-9]*(-[A-Z0-9]+)*-\d+|\d+-\d+)$/i;
    
    if (!issueIdPattern.test(issueId)) {
      throw new ValidationError(
        `Invalid ${fieldName} format: '${issueId}'. Must be in format 'PROJECT-123' or '3-511'`,
        fieldName
      );
    }

    return issueId;
  }

  /**
   * Validate date format (YYYY-MM-DD)
   */
  static validateDate(date: string | undefined, fieldName: string): string | undefined {
    if (!date) return undefined;

    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    if (!datePattern.test(date)) {
      throw new ValidationError(
        `Invalid ${fieldName} format: '${date}'. Must be in YYYY-MM-DD format`,
        fieldName
      );
    }

    // Validate it's a real date
    const parsedDate = new Date(date);
    if (isNaN(parsedDate.getTime())) {
      throw new ValidationError(`Invalid ${fieldName}: '${date}' is not a valid date`, fieldName);
    }

    return date;
  }

  /**
   * Validate enum values
   */
  static validateEnum<T extends string>(
    value: string | undefined,
    allowedValues: readonly T[],
    fieldName: string,
    required = true
  ): T | undefined {
    if (!value) {
      if (required) {
        throw new ValidationError(`${fieldName} is required`, fieldName);
      }
      return undefined;
    }

    if (!allowedValues.includes(value as T)) {
      throw new ValidationError(
        `Invalid ${fieldName}: '${value}'. Must be one of: ${allowedValues.join(', ')}`,
        fieldName
      );
    }

    return value as T;
  }

  /**
   * Validate required string parameter
   */
  static validateRequired(value: string | undefined, fieldName: string): string {
    if (!value || value.trim() === '') {
      throw new ValidationError(`${fieldName} is required and cannot be empty`, fieldName);
    }
    return value.trim();
  }

  /**
   * Validate time duration format (e.g., "2h", "30m", "1d")
   */
  static validateDuration(duration: string | undefined, fieldName = 'duration'): string | undefined {
    if (!duration) return undefined;

    const durationPattern = /^\d+[hdwm]$/i;
    if (!durationPattern.test(duration)) {
      throw new ValidationError(
        `Invalid ${fieldName} format: '${duration}'. Must be like '2h', '30m', '1d', '1w'`,
        fieldName
      );
    }

    return duration;
  }

  /**
   * Convert ValidationError to McpError
   */
  static toMcpError(error: ValidationError): McpError {
    return new McpError(
      ErrorCode.InvalidParams,
      `Parameter validation failed: ${error.message}`,
      { field: error.field }
    );
  }
}

/**
 * Decorator for tool methods to add automatic parameter validation
 */
export function validateParams(validationRules: Record<string, (value: any) => any>) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const [client, params] = args;

      try {
        // Apply validation rules
        const validatedParams = { ...params };
        
        for (const [field, validator] of Object.entries(validationRules)) {
          try {
            validatedParams[field] = validator(params[field]);
          } catch (error) {
            if (error instanceof ValidationError) {
              logger.error('Parameter validation failed', { 
                tool: propertyKey, 
                field, 
                value: params[field],
                error: error.message 
              });
              throw ParameterValidator.toMcpError(error);
            }
            throw error;
          }
        }

        // Call original method with validated params
        return await originalMethod.call(this, client, validatedParams);
      } catch (error) {
        logger.error('Tool execution failed', { 
          tool: propertyKey, 
          params, 
          error: error instanceof Error ? error.message : error 
        });
        throw error;
      }
    };

    return descriptor;
  };
}

/**
 * Tool name mapping to help with backward compatibility
 */
export const TOOL_NAME_MAPPINGS: Record<string, string> = {
  // Old tool names -> New tool names
  'query_issues': 'query',
  'list_projects': 'projects',
  'create_issue': 'issues',
  'get_issue': 'issues',
  'update_issue': 'issues',
  'search_issues': 'issues',
  'advanced_query_issues': 'query',
  'smart_search_issues': 'issues',
  'get_issue_comments': 'comments',
  'add_issue_comment': 'comments',
  'list_agile_boards': 'agile_boards',
  'get_board_details': 'agile_boards',
  'list_articles': 'knowledge_base',
  'get_article': 'knowledge_base',
  'create_article': 'knowledge_base',
  'get_project_statistics': 'analytics',
  'search_users': 'admin',
  'log_time': 'time_tracking',
  'get_time_entries': 'time_tracking',
  'auth_manage': 'auth'
};

/**
 * Suggest correct tool name for unknown tools
 */
export function suggestToolName(unknownTool: string): string {
  const mapped = TOOL_NAME_MAPPINGS[unknownTool];
  if (mapped) {
    return `Did you mean '${mapped}'? The tool '${unknownTool}' has been consolidated into '${mapped}'.`;
  }

  // Find similar tool names
  const availableTools = ['projects', 'issues', 'query', 'comments', 'agile_boards', 'knowledge_base', 'analytics', 'admin', 'time_tracking'];
  const similar = availableTools.find(tool => 
    tool.includes(unknownTool.toLowerCase()) || 
    unknownTool.toLowerCase().includes(tool)
  );

  if (similar) {
    return `Did you mean '${similar}'?`;
  }

  return `Available tools: ${availableTools.join(', ')}`;
}
