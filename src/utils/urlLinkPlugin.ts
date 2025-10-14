import { $prose } from '@milkdown/utils'
import { Plugin, PluginKey } from '@milkdown/prose/state'
import { Decoration, DecorationSet } from '@milkdown/prose/view'
import { open } from '@tauri-apps/plugin-shell'

const urlLinkPluginKey = new PluginKey('url-link')

export const urlLinkPlugin = () => {
  return $prose(() => {
    return new Plugin({
      key: urlLinkPluginKey,
      props: {
        decorations(state) {
          const decorations: Decoration[] = []
          const doc = state.doc

          doc.descendants((node, pos) => {
            if (!node.isText || !node.text) return

            // Match URLs (http, https, www)
            const urlRegex = /https?:\/\/[^\s]+|www\.[^\s]+/g
            let match

            while ((match = urlRegex.exec(node.text)) !== null) {
              const from = pos + match.index
              const to = from + match[0].length
              const url = match[0]

              decorations.push(
                Decoration.inline(from, to, {
                  class: 'external-link',
                  'data-url': url,
                })
              )
            }
          })

          return DecorationSet.create(doc, decorations)
        },
        handleClick(_view, _pos, event) {
          const target = event.target as HTMLElement

          // Only trigger on Ctrl+Click or Cmd+Click
          if (target && target.classList.contains('external-link') && (event.ctrlKey || event.metaKey)) {
            const url = target.getAttribute('data-url')

            if (url) {
              event.preventDefault()
              event.stopPropagation()

              // Add protocol if missing (for www. links)
              const fullUrl = url.startsWith('http') ? url : `https://${url}`

              // Open URL in default browser
              open(fullUrl).catch((err) => {
                console.error('Failed to open URL:', err)
              })

              return true
            }
          }

          return false
        },
      },
    })
  })
}
