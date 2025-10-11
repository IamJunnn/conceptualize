import { $prose } from '@milkdown/utils'
import { Plugin, PluginKey } from '@milkdown/prose/state'
import { toggleMark } from '@milkdown/prose/commands'
import { strongSchema, emphasisSchema } from '@milkdown/preset-commonmark'

const keyboardShortcutsKey = new PluginKey('keyboard-shortcuts')

export const keyboardShortcuts = () => {
  return $prose((ctx) => {
    return new Plugin({
      key: keyboardShortcutsKey,
      props: {
        handleKeyDown(view, event) {
          const { state, dispatch } = view

          // Ctrl+B or Cmd+B for bold
          if ((event.ctrlKey || event.metaKey) && event.key === 'b') {
            event.preventDefault()
            const strongType = strongSchema.type(ctx)
            toggleMark(strongType)(state, dispatch)
            return true
          }

          // Ctrl+I or Cmd+I for italic
          if ((event.ctrlKey || event.metaKey) && event.key === 'i') {
            event.preventDefault()
            const emphasisType = emphasisSchema.type(ctx)
            toggleMark(emphasisType)(state, dispatch)
            return true
          }

          return false
        },
      },
    })
  })
}
