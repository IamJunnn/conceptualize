import { EditorView } from '@codemirror/view';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';

// Create a custom theme for markdown
export const markdownTheme = EditorView.theme({
  '&': {
    fontSize: '14px'
  },
  '.cm-content': {
    fontFamily: "'Consolas', 'Monaco', 'Courier New', monospace"
  },
  '.cm-line': {
    padding: '0 2px'
  }
});

// Create custom syntax highlighting for markdown
export const markdownHighlighting = syntaxHighlighting(
  HighlightStyle.define([
    // Headings
    { tag: t.heading1, fontSize: '2em', fontWeight: 'bold', color: '#e0e0e0' },
    { tag: t.heading2, fontSize: '1.75em', fontWeight: 'bold', color: '#d4d4d4' },
    { tag: t.heading3, fontSize: '1.5em', fontWeight: 'bold', color: '#cccccc' },
    { tag: t.heading4, fontSize: '1.25em', fontWeight: 'bold', color: '#c0c0c0' },
    { tag: t.heading5, fontSize: '1.1em', fontWeight: 'bold', color: '#b0b0b0' },
    { tag: t.heading6, fontSize: '1em', fontWeight: 'bold', color: '#a0a0a0' },

    // Bold and italic
    { tag: t.strong, fontWeight: 'bold' },
    { tag: t.emphasis, fontStyle: 'italic' },

    // Links
    { tag: t.link, color: '#007acc', textDecoration: 'underline' },
    { tag: t.url, color: '#007acc' },

    // Code
    { tag: t.monospace, fontFamily: 'monospace', color: '#ce9178' },

    // Formatting marks (the #, **, *, etc.)
    { tag: t.processingInstruction, color: '#6a6a6a' },
    { tag: t.punctuation, color: '#6a6a6a' }
  ])
);
