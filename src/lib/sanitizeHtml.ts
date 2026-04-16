const BLOCKED_TAGS = new Set(['script', 'style', 'iframe', 'object', 'embed', 'link', 'meta']);

const ALLOWED_TAGS = new Set([
  'a', 'abbr', 'b', 'blockquote', 'br', 'code', 'div', 'em', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'hr', 'i', 'img', 'li', 'ol', 'p', 'pre', 'span', 'strong', 'table', 'tbody', 'td', 'th', 'thead', 'tr', 'u', 'ul'
]);

const SAFE_URL_PROTOCOLS = ['http:', 'https:', 'mailto:', 'tel:'];

function isSafeUrl(url: string): boolean {
  if (!url) return false;

  try {
    const parsed = new URL(url, window.location.origin);
    return SAFE_URL_PROTOCOLS.includes(parsed.protocol);
  } catch {
    return false;
  }
}

function sanitizeElementAttributes(element: Element): void {
  const attributes = Array.from(element.attributes);

  for (const attribute of attributes) {
    const name = attribute.name.toLowerCase();
    const value = attribute.value.trim();

    if (name.startsWith('on')) {
      element.removeAttribute(attribute.name);
      continue;
    }

    if (name === 'style') {
      element.removeAttribute(attribute.name);
      continue;
    }

    if ((name === 'src' || name === 'href') && !isSafeUrl(value)) {
      element.removeAttribute(attribute.name);
      continue;
    }

    if (name === 'target' && value === '_blank') {
      element.setAttribute('rel', 'noopener noreferrer');
    }
  }
}

function sanitizeNode(node: Node): void {
  if (node.nodeType !== Node.ELEMENT_NODE) return;

  const element = node as Element;
  const tagName = element.tagName.toLowerCase();

  if (BLOCKED_TAGS.has(tagName)) {
    element.remove();
    return;
  }

  if (!ALLOWED_TAGS.has(tagName)) {
    const parent = element.parentNode;
    if (!parent) return;

    while (element.firstChild) {
      parent.insertBefore(element.firstChild, element);
    }
    parent.removeChild(element);
    return;
  }

  sanitizeElementAttributes(element);

  const children = Array.from(element.childNodes);
  for (const child of children) {
    sanitizeNode(child);
  }
}

export function sanitizeHtml(unsafeHtml: string): string {
  if (!unsafeHtml) return '';

  const parser = new DOMParser();
  const doc = parser.parseFromString(unsafeHtml, 'text/html');

  const nodes = Array.from(doc.body.childNodes);
  for (const node of nodes) {
    sanitizeNode(node);
  }

  return doc.body.innerHTML;
}
