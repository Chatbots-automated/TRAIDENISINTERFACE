import React, { useMemo } from 'react';
import { sanitizeHtml } from '../lib/sanitizeHtml';

interface SafeHtmlProps {
  html: string;
  className?: string;
}

export default function SafeHtml({ html, className }: SafeHtmlProps) {
  const safeHtml = useMemo(() => sanitizeHtml(html), [html]);

  return <div className={className} dangerouslySetInnerHTML={{ __html: safeHtml }} />;
}
