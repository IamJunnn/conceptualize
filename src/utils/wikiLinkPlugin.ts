import { $prose } from '@milkdown/utils'
import { Plugin, PluginKey } from '@milkdown/prose/state'
import { Decoration, DecorationSet } from '@milkdown/prose/view'

export interface WikiLinkPluginOptions {
  onWikiLinkClick?: (noteName: string) => void
}

const wikiLinkPluginKey = new PluginKey('wiki-link')

export const wikiLinkPlugin = (options: WikiLinkPluginOptions = {}) => {
  return $prose(() => {
    return new Plugin({
      key: wikiLinkPluginKey,
      props: {
        decorations(state) {
          const decorations: Decoration[] = []
          const doc = state.doc

          doc.descendants((node, pos) => {
            if (!node.isText || !node.text) return

            // Match completed wiki-links: [[note name]]
            const completeRegex = /\[\[([^\]]+)\]\]/g
            let match

            while ((match = completeRegex.exec(node.text)) !== null) {
              const from = pos + match.index
              const to = from + match[0].length
              const noteName = match[1]

              decorations.push(
                Decoration.inline(from, to, {
                  class: 'wiki-link',
                  'data-note-name': noteName,
                })
              )
            }

            // Match incomplete wiki-links: [[ or [[text (without closing ]])
            const incompleteRegex = /\[\[(?![^\]]*\]\])([^\]]*)/g
            let incompleteMatch

            while ((incompleteMatch = incompleteRegex.exec(node.text)) !== null) {
              const from = pos + incompleteMatch.index
              const to = from + incompleteMatch[0].length

              decorations.push(
                Decoration.inline(from, to, {
                  class: 'wiki-link-incomplete',
                })
              )
            }
          })

          return DecorationSet.create(doc, decorations)
        },
        handleClick(_view, _pos, event) {
          const target = event.target as HTMLElement

          // Only trigger on Ctrl+Click or Cmd+Click
          if (target && target.classList.contains('wiki-link') && (event.ctrlKey || event.metaKey)) {
            const noteName = target.getAttribute('data-note-name')

            if (noteName && options.onWikiLinkClick) {
              event.preventDefault()
              event.stopPropagation()
              options.onWikiLinkClick(noteName)
              return true
            }
          }

          return false
        },
      },
    })
  })
}
