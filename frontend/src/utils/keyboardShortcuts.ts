import { $prose } from '@milkdown/utils'
import { Plugin, PluginKey } from '@milkdown/prose/state'
import { toggleMark } from '@milkdown/prose/commands'
import { strongSchema, emphasisSchema } from '@milkdown/preset-commonmark'
import { sinkListItem, liftListItem } from '@milkdown/prose/schema-list'

const keyboardShortcutsKey = new PluginKey('keyboard-shortcuts')

export const keyboardShortcuts = () => {
  return $prose((ctx) => {
    return new Plugin({
      key: keyboardShortcutsKey,
      props: {
        handleKeyDown(view, event) {
          const { state, dispatch } = view

          // Tab to indent list item (sink) - Handle FIRST to prevent default behavior
          if (event.key === 'Tab' && !event.shiftKey) {
            const listItemType = state.schema.nodes.list_item
            if (listItemType) {
              // Check if we're currently in a list item
              const { $from } = state.selection
              const inList = $from.node(-2)?.type === state.schema.nodes.bullet_list ||
                            $from.node(-2)?.type === state.schema.nodes.ordered_list

              if (inList) {
                event.preventDefault()
                sinkListItem(listItemType)(state, dispatch)
                return true
              }
            }
          }

          // Shift+Tab to outdent list item (lift) - Handle FIRST to prevent default behavior
          if (event.key === 'Tab' && event.shiftKey) {
            const listItemType = state.schema.nodes.list_item
            if (listItemType) {
              // Check if we're currently in a list item
              const { $from } = state.selection
              const inList = $from.node(-2)?.type === state.schema.nodes.bullet_list ||
                            $from.node(-2)?.type === state.schema.nodes.ordered_list

              if (inList) {
                event.preventDefault()
                liftListItem(listItemType)(state, dispatch)
                return true
              }
            }
          }

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
