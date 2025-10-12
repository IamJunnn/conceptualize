import { useEffect, useRef } from 'react'
import { Editor, rootCtx, defaultValueCtx } from '@milkdown/core'
import { commonmark } from '@milkdown/preset-commonmark'
import { gfm } from '@milkdown/preset-gfm'
import { nord } from '@milkdown/theme-nord'
import { Milkdown, MilkdownProvider, useEditor } from '@milkdown/react'
import { listener, listenerCtx } from '@milkdown/plugin-listener'
import { history } from '@milkdown/plugin-history'
import { clipboard } from '@milkdown/plugin-clipboard'
import { wikiLinkPlugin } from '../utils/wikiLinkPlugin'
import { urlLinkPlugin } from '../utils/urlLinkPlugin'
import { keyboardShortcuts } from '../utils/keyboardShortcuts'
import '@milkdown/theme-nord/style.css'
import './MilkdownEditor.css'

interface MilkdownEditorProps {
  content: string
  onChange: (content: string) => void
  onWikiLinkClick?: (noteName: string) => void
  rootPath?: string
}

function MilkdownEditorInner({ content, onChange, onWikiLinkClick, rootPath }: MilkdownEditorProps) {
  const editorRef = useRef<Editor | null>(null)

  useEditor((root) => {
    const editor = Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, root)
        ctx.set(defaultValueCtx, content)

        // Set up listener for content changes
        ctx.get(listenerCtx).markdownUpdated((_ctx, markdown) => {
          onChange(markdown)
        })
      })
      .use(nord)
      .use(commonmark)
      .use(gfm)
      .use(history)
      .use(clipboard)
      .use(listener)
      .use(wikiLinkPlugin({ onWikiLinkClick, rootPath }))
      .use(urlLinkPlugin())
      .use(keyboardShortcuts())

    editorRef.current = editor
    return editor
  }, [onWikiLinkClick, rootPath])

  // Update editor content when prop changes
  useEffect(() => {
    if (editorRef.current) {
      const currentContent = editorRef.current.action((ctx) => {
        return ctx.get(defaultValueCtx)
      })

      if (currentContent !== content) {
        editorRef.current.action((ctx) => {
          ctx.set(defaultValueCtx, content)
        })
      }
    }
  }, [content])

  return <Milkdown />
}

export default function MilkdownEditor({ content, onChange, onWikiLinkClick, rootPath }: MilkdownEditorProps) {
  return (
    <MilkdownProvider>
      <MilkdownEditorInner content={content} onChange={onChange} onWikiLinkClick={onWikiLinkClick} rootPath={rootPath} />
    </MilkdownProvider>
  )
}
