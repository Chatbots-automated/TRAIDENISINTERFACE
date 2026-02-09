/**
 * YAML Artifact Editor
 *
 * Utilities for parsing and editing commercial offer YAML artifacts
 *
 * NOTE: This is a simplified YAML parser for our specific use case.
 * For production, install js-yaml: npm install js-yaml @types/js-yaml
 */

/**
 * Simple YAML parser for our commercial offer format
 * This handles the specific structure we use, not general YAML
 */
export function parseCommercialOfferYAML(yamlString: string): any {
  const lines = yamlString.split('\n');
  const result: any = {};
  let currentPath: string[] = [];
  let currentObject: any = result;
  let isMultilineValue = false;
  let multilineKey = '';
  let multilineValue: string[] = [];

  for (const line of lines) {
    // Skip empty lines and comments
    if (!line.trim() || line.trim().startsWith('#')) {
      continue;
    }

    // Count indentation
    const indent = line.search(/\S/);
    const trimmed = line.trim();

    // Handle multiline values (pipe |)
    if (trimmed.match(/\|$/)) {
      isMultilineValue = true;
      multilineKey = trimmed.replace(/:\s*\|$/, '');
      multilineValue = [];
      continue;
    }

    if (isMultilineValue) {
      if (indent <= currentPath.length * 2 && trimmed) {
        // End of multiline value
        const target = getNestedObject(result, currentPath);
        target[multilineKey] = multilineValue.join('\n');
        isMultilineValue = false;
        multilineKey = '';
        multilineValue = [];
        // Process current line
      } else {
        multilineValue.push(line.replace(/^\s{2,}/, '')); // Remove indentation
        continue;
      }
    }

    // Handle list items
    if (trimmed.startsWith('- ')) {
      const listValue = trimmed.substring(2).replace(/^["']|["']$/g, '');
      const parentPath = currentPath.slice(0, -1);
      const listKey = currentPath[currentPath.length - 1];
      const parent = getNestedObject(result, parentPath);
      if (!Array.isArray(parent[listKey])) {
        parent[listKey] = [];
      }
      parent[listKey].push(listValue);
      continue;
    }

    // Handle key-value pairs
    if (trimmed.includes(':')) {
      const colonIndex = trimmed.indexOf(':');
      const key = trimmed.substring(0, colonIndex).trim();
      const value = trimmed.substring(colonIndex + 1).trim();

      // Determine nesting level
      const level = Math.floor(indent / 2);
      currentPath = currentPath.slice(0, level);

      if (!value || value === '') {
        // This is an object key
        currentPath.push(key);
        const parent = getNestedObject(result, currentPath.slice(0, -1));
        parent[key] = {};
      } else {
        // This is a key-value pair
        const parent = getNestedObject(result, currentPath);
        parent[key] = parseValue(value);
      }
    }
  }

  return result;
}

/**
 * Get nested object by path
 */
function getNestedObject(obj: any, path: string[]): any {
  let current = obj;
  for (const key of path) {
    if (!current[key]) {
      current[key] = {};
    }
    current = current[key];
  }
  return current;
}

/**
 * Parse a YAML value to appropriate JavaScript type
 */
function parseValue(value: string): any {
  // Remove quotes
  const unquoted = value.replace(/^["']|["']$/g, '');

  // Check for number
  if (!isNaN(Number(unquoted)) && unquoted !== '') {
    return Number(unquoted);
  }

  // Check for boolean
  if (unquoted === 'true') return true;
  if (unquoted === 'false') return false;
  if (unquoted === 'null') return null;

  return unquoted;
}

/**
 * Convert JavaScript object to YAML string
 */
export function stringifyToYAML(obj: any, indent: number = 0): string {
  const lines: string[] = [];
  const prefix = '  '.repeat(indent);

  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) {
      continue;
    }

    if (Array.isArray(value)) {
      lines.push(`${prefix}${key}:`);
      for (const item of value) {
        lines.push(`${prefix}  - "${item}"`);
      }
    } else if (typeof value === 'object') {
      lines.push(`${prefix}${key}:`);
      lines.push(stringifyToYAML(value, indent + 1));
    } else if (typeof value === 'string' && value.includes('\n')) {
      // Multiline string
      lines.push(`${prefix}${key}: |`);
      const textLines = value.split('\n');
      for (const line of textLines) {
        lines.push(`${prefix}  ${line}`);
      }
    } else if (typeof value === 'number') {
      lines.push(`${prefix}${key}: ${value}`);
    } else {
      lines.push(`${prefix}${key}: "${value}"`);
    }
  }

  return lines.join('\n');
}

/**
 * Apply an edit to a commercial offer artifact
 */
export function applyEditToArtifact(
  artifactContent: string,
  fieldPath: string,
  newValue: string
): { success: boolean; newContent?: string; error?: string; oldValue?: any } {
  try {
    // Extract YAML from <commercial_offer> tags
    const match = artifactContent.match(/<commercial_offer[^>]*>([\s\S]*?)<\/commercial_offer>/);
    if (!match) {
      return {
        success: false,
        error: 'Could not find <commercial_offer> tags in artifact'
      };
    }

    const fullContent = match[1].trim();

    // Extract YAML between --- delimiters
    const yamlMatch = fullContent.match(/---\n([\s\S]*?)\n---/);
    if (!yamlMatch) {
      return {
        success: false,
        error: 'Could not find YAML content between --- delimiters'
      };
    }

    const yamlContent = yamlMatch[1];

    // Parse YAML
    const data = parseCommercialOfferYAML(yamlContent);

    // Get old value and update field
    const pathParts = fieldPath.split('.');
    let target: any = data;
    let oldValue: any;

    // Navigate to parent
    for (let i = 0; i < pathParts.length - 1; i++) {
      const part = pathParts[i];
      if (target[part] === undefined) {
        return {
          success: false,
          error: `Field path "${fieldPath}" not found in YAML. Path part "${part}" does not exist.`
        };
      }
      target = target[part];
    }

    // Update value
    const lastKey = pathParts[pathParts.length - 1];
    oldValue = target[lastKey];

    if (oldValue === undefined) {
      return {
        success: false,
        error: `Field "${lastKey}" not found at path "${fieldPath}"`
      };
    }

    // Convert new value to appropriate type
    let typedValue: any = newValue;
    if (typeof oldValue === 'number' && !isNaN(Number(newValue))) {
      typedValue = Number(newValue);
    } else if (typeof oldValue === 'boolean') {
      typedValue = newValue === 'true' || newValue === '1';
    }

    target[lastKey] = typedValue;

    // Convert back to YAML
    const newYamlContent = stringifyToYAML(data);

    // Rebuild artifact content
    const newContent = artifactContent.replace(
      /---\n[\s\S]*?\n---/,
      `---\n${newYamlContent}\n---`
    );

    return {
      success: true,
      newContent,
      oldValue
    };
  } catch (error: any) {
    return {
      success: false,
      error: `Failed to apply edit: ${error.message}`
    };
  }
}

/**
 * Extract artifact ID from commercial offer tags
 */
export function extractArtifactId(content: string): string | null {
  const match = content.match(/<commercial_offer\s+artifact_id="([^"]+)"/);
  return match ? match[1] : null;
}
