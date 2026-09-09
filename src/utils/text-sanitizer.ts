/**
 * Text Sanitization Utilities
 * Handles common text formatting issues in issue descriptions and comments
 */

/**
 * Unescapes markdown formatting that may have been accidentally escaped
 * Common issues:
 * - Escaped backticks: \` -> `
 * - Escaped asterisks: \* -> *
 * - Escaped underscores: \_ -> _
 */
export function unescapeMarkdown(text: string | undefined): string {
  if (!text) return '';
  
  let result = text;
  
  // Unescape backticks (most common issue with code blocks)
  // Replace \` with ` but preserve actual backslashes before backticks if intentional
  result = result.replace(/\\`/g, '`');
  
  // Unescape other common markdown characters
  result = result.replace(/\\\*/g, '*');
  result = result.replace(/\\_/g, '_');
  result = result.replace(/\\#/g, '#');
  result = result.replace(/\\-/g, '-');
  result = result.replace(/\\\[/g, '[');
  result = result.replace(/\\\]/g, ']');
  result = result.replace(/\\\(/g, '(');
  result = result.replace(/\\\)/g, ')');
  
  return result;
}

/**
 * Sanitizes description text for YouTrack issues
 * - Unescapes markdown
 * - Trims whitespace
 * - Ensures proper line endings
 */
export function sanitizeDescription(description: string | undefined): string {
  if (!description) return '';
  
  let sanitized = unescapeMarkdown(description);
  
  // Normalize line endings to \n
  sanitized = sanitized.replace(/\r\n/g, '\n');
  
  // Remove excessive blank lines (more than 2 consecutive)
  sanitized = sanitized.replace(/\n{3,}/g, '\n\n');
  
  // Trim leading/trailing whitespace
  sanitized = sanitized.trim();
  
  return sanitized;
}

/**
 * Sanitizes comment text
 * Similar to description plus strips HTML/script tags for safety
 */
export function sanitizeComment(comment: string | undefined): string {
  if (!comment) return '';
  let out = comment;
  out = out.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  out = out.replace(/<[^>]+>/g, '');
  return sanitizeDescription(out);
}
