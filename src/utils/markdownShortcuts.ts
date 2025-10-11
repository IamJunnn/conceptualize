import { EditorView, keymap } from '@codemirror/view';
import { EditorSelection } from '@codemirror/state';

// Helper function to wrap selected text with markers
function wrapSelection(view: EditorView, marker: string): boolean {
  const { state } = view;
  const { selection } = state;

  const changes = selection.ranges.map(range => {
    const selectedText = state.doc.sliceString(range.from, range.to);

    // If text is already wrapped, unwrap it
    if (selectedText.startsWith(marker) && selectedText.endsWith(marker)) {
      return {
        from: range.from,
        to: range.to,
        insert: selectedText.slice(marker.length, -marker.length)
      };
    }

    // Otherwise, wrap it
    return {
      from: range.from,
      to: range.to,
      insert: `${marker}${selectedText}${marker}`
    };
  });

  view.dispatch({
    changes,
    selection: EditorSelection.create(
      changes.map((change, i) => {
        const offset = change.insert.length - (selection.ranges[i].to - selection.ranges[i].from);
        return EditorSelection.range(
          change.from,
          change.from + change.insert.length
        );
      })
    )
  });

  return true;
}

// Bold shortcut (Ctrl+B or Cmd+B)
function toggleBold(view: EditorView): boolean {
  return wrapSelection(view, '**');
}

// Italic shortcut (Ctrl+I or Cmd+I)
function toggleItalic(view: EditorView): boolean {
  return wrapSelection(view, '*');
}

// Create the keyboard shortcuts extension
export function markdownShortcuts() {
  return keymap.of([
    {
      key: 'Mod-b',
      run: toggleBold,
      preventDefault: true
    },
    {
      key: 'Mod-i',
      run: toggleItalic,
      preventDefault: true
    }
  ]);
}
