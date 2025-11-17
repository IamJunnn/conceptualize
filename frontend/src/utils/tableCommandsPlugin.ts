import { $prose } from '@milkdown/utils'
import { Plugin, PluginKey } from '@milkdown/prose/state'

// Re-export the GFM table commands for easy access
export {
  addRowBeforeCommand,
  addRowAfterCommand,
  addColBeforeCommand,
  addColAfterCommand,
} from '@milkdown/preset-gfm'

// Create a ProseMirror plugin to handle table interactions
const tableWidgetPluginKey = new PluginKey('tableWidgetPlugin')

export const tableWidgetPlugin = $prose(() => {
  return new Plugin({
    key: tableWidgetPluginKey,
    props: {
      // Add any custom handling here if needed
      handleDOMEvents: {
        // You can add custom event handlers here
      },
    },
  })
})
