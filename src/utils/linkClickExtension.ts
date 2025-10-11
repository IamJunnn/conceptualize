import { EditorView, ViewPlugin, ViewUpdate, Decoration, DecorationSet, WidgetType } from '@codemirror/view';
import { RangeSetBuilder, StateField, StateEffect } from '@codemirror/state';
import { open } from '@tauri-apps/plugin-shell';

// Interface for link information
interface LinkInfo {
  from: number;
  to: number;
  url: string;
  isWikiLink: boolean;
}

// Tooltip widget that shows "Follow link (ctrl + click)"
class LinkTooltipWidget extends WidgetType {
  constructor(readonly link: LinkInfo) {
    super();
  }

  toDOM() {
    const tooltip = document.createElement('div');
    tooltip.className = 'cm-link-tooltip';
    tooltip.textContent = 'Follow link (ctrl + click)';
    return tooltip;
  }

  eq(other: LinkTooltipWidget) {
    return this.link.from === other.link.from && this.link.to === other.link.to;
  }
}

// Extract links from editor content
function findLinks(view: EditorView): LinkInfo[] {
  const links: LinkInfo[] = [];
  const doc = view.state.doc;
  const text = doc.toString();

  // Find wiki-links [[note-name]]
  const wikiLinkRegex = /\[\[([^\]]+)\]\]/g;
  let match: RegExpExecArray | null;
  while ((match = wikiLinkRegex.exec(text)) !== null) {
    links.push({
      from: match.index,
      to: match.index + match[0].length,
      url: match[1], // The note name
      isWikiLink: true
    });
  }

  // Find markdown links [text](url)
  const mdLinkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  while ((match = mdLinkRegex.exec(text)) !== null) {
    // Highlight the entire link for clicking
    links.push({
      from: match.index,
      to: match.index + match[0].length,
      url: match[2],
      isWikiLink: false
    });
  }

  // Find plain URLs (http:// or https://)
  const urlRegex = /https?:\/\/[^\s<>"\[\]]+/g;
  while ((match = urlRegex.exec(text)) !== null) {
    // Check if this URL is already part of a markdown link
    const isPartOfMdLink = links.some(link =>
      !link.isWikiLink && match!.index >= link.from && match!.index < link.to
    );

    if (!isPartOfMdLink) {
      links.push({
        from: match.index,
        to: match.index + match[0].length,
        url: match[0],
        isWikiLink: false
      });
    }
  }

  return links;
}

// Custom decoration for links
const linkMark = Decoration.mark({
  class: 'cm-link'
});

// Create decorations for links
function createLinkDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const links = findLinks(view);

  for (const link of links) {
    builder.add(link.from, link.to, linkMark);
  }

  return builder.finish();
}

// State effect to show/hide tooltip
const showTooltipEffect = StateEffect.define<{ pos: number; link: LinkInfo } | null>();

// State field to track tooltip
const tooltipField = StateField.define<{ pos: number; link: LinkInfo } | null>({
  create: () => null,
  update: (value, tr) => {
    for (const effect of tr.effects) {
      if (effect.is(showTooltipEffect)) {
        return effect.value;
      }
    }
    return value;
  },
  provide: f => EditorView.decorations.from(f, tooltip => {
    if (!tooltip) return Decoration.none;
    return Decoration.set([
      Decoration.widget({
        widget: new LinkTooltipWidget(tooltip.link),
        side: 1
      }).range(tooltip.pos)
    ]);
  })
});

// Handler for opening links
export interface LinkClickHandler {
  onWikiLinkClick: (noteName: string) => void;
}

// Create the link click extension
export function linkClickExtension(handler: LinkClickHandler) {
  const linkDecorations = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = createLinkDecorations(view);
      }

      update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged) {
          this.decorations = createLinkDecorations(update.view);
        }
      }
    },
    {
      decorations: (v) => v.decorations
    }
  );

  const linkClickHandler = EditorView.domEventHandlers({
    click: (event: MouseEvent, view: EditorView) => {
      // Only handle Ctrl+Click (or Cmd+Click on Mac)
      if (!event.ctrlKey && !event.metaKey) {
        return false;
      }

      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
      if (pos === null) return false;

      const links = findLinks(view);
      const clickedLink = links.find(link => pos >= link.from && pos <= link.to);

      if (clickedLink) {
        event.preventDefault();
        event.stopPropagation();

        console.log('Link clicked:', clickedLink);

        if (clickedLink.isWikiLink) {
          // Internal wiki-link
          console.log('Opening wiki-link:', clickedLink.url);
          handler.onWikiLinkClick(clickedLink.url);
        } else {
          // External URL
          console.log('Opening external URL:', clickedLink.url);
          open(clickedLink.url).catch(err => {
            console.error('Failed to open URL:', err);
            alert(`Failed to open URL: ${err}`);
          });
        }

        return true;
      }

      return false;
    },

    mousemove: (event: MouseEvent, view: EditorView) => {
      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
      if (pos === null) {
        view.dispatch({
          effects: showTooltipEffect.of(null)
        });
        return false;
      }

      const links = findLinks(view);
      const hoveredLink = links.find(link => pos >= link.from && pos <= link.to);

      if (hoveredLink) {
        // Show tooltip
        view.dispatch({
          effects: showTooltipEffect.of({ pos: hoveredLink.to, link: hoveredLink })
        });

        // Change cursor if Ctrl/Cmd is held
        if (event.ctrlKey || event.metaKey) {
          view.dom.style.cursor = 'pointer';
        } else {
          view.dom.style.cursor = 'default';
        }
      } else {
        // Hide tooltip
        view.dispatch({
          effects: showTooltipEffect.of(null)
        });
        view.dom.style.cursor = '';
      }

      return false;
    },

    mouseleave: (_event: MouseEvent, view: EditorView) => {
      view.dispatch({
        effects: showTooltipEffect.of(null)
      });
      view.dom.style.cursor = '';
      return false;
    },

    keydown: (event: KeyboardEvent, view: EditorView) => {
      // Update cursor when Ctrl/Cmd is pressed while hovering
      if (event.key === 'Control' || event.key === 'Meta') {
        const mouseEvent = event as any;
        if (mouseEvent.clientX && mouseEvent.clientY) {
          const pos = view.posAtCoords({ x: mouseEvent.clientX, y: mouseEvent.clientY });
          if (pos !== null) {
            const links = findLinks(view);
            const hoveredLink = links.find(link => pos >= link.from && pos <= link.to);
            if (hoveredLink) {
              view.dom.style.cursor = 'pointer';
            }
          }
        }
      }
      return false;
    },

    keyup: (event: KeyboardEvent, view: EditorView) => {
      if (event.key === 'Control' || event.key === 'Meta') {
        view.dom.style.cursor = '';
      }
      return false;
    }
  });

  return [linkDecorations, tooltipField, linkClickHandler];
}
