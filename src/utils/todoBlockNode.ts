import { $node, $nodeAttr } from '@milkdown/utils'
import { Node } from '@milkdown/prose/model'

// Define the todoBlock node type
export const todoBlockNode = $node('todoBlock', () => ({
  group: 'block',
  atom: true, // Treat as a single unit (can't edit inside)
  attrs: {
    todoId: $nodeAttr(''),
  },
  parseDOM: [
    {
      tag: 'div[data-todo-block]',
      getAttrs: (dom) => {
        const element = dom as HTMLElement
        return {
          todoId: element.getAttribute('data-todo-id') || '',
        }
      },
    },
  ],
  toDOM: (node: Node) => {
    return [
      'div',
      {
        'data-todo-block': 'true',
        'data-todo-id': node.attrs.todoId,
        class: 'todo-block-node',
      },
      0, // Content goes here (but we'll override with NodeView)
    ]
  },
  parseMarkdown: {
    match: (node) => {
      // Match {{todo:id}} pattern in markdown
      if (node.type === 'text' && node.value) {
        const match = /^\{\{todo:([a-zA-Z0-9-]+)\}\}$/.exec(node.value)
        return match !== null
      }
      return false
    },
    runner: (state, node, type) => {
      const match = /\{\{todo:([a-zA-Z0-9-]+)\}\}/.exec(node.value as string)
      if (match) {
        const todoId = match[1]
        state.addNode(type, { todoId })
      }
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === 'todoBlock',
    runner: (state, node) => {
      state.addNode('text', undefined, `{{todo:${node.attrs.todoId}}}`)
    },
  },
}))
