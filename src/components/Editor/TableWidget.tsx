import { useEffect, useState, useRef } from 'react'
import { Editor, editorViewCtx } from '@milkdown/core'
import { TextSelection } from '@milkdown/prose/state'
import { callCommand } from '@milkdown/utils'
import {
  addColAfterCommand,
  addColBeforeCommand,
  addRowAfterCommand,
  addRowBeforeCommand,
} from '@milkdown/preset-gfm'
import { isInTable } from '@milkdown/prose/tables'

interface TableWidgetProps {
  editor: Editor | null
}

interface BorderLine {
  top: number
  left: number
  width: number
  height: number
  type: 'horizontal' | 'vertical'
  insertType: 'row-before' | 'row-after' | 'col-before' | 'col-after'
}

export default function TableWidget({ editor }: TableWidgetProps) {
  const [hoveredLine, setHoveredLine] = useState<BorderLine | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [editorReady, setEditorReady] = useState(false)
  const isHoveringButtonRef = useRef(false)

  // Wait for editor to be fully mounted
  useEffect(() => {
    if (!editor) return

    const timer = setTimeout(() => {
      const proseMirrorElement = document.querySelector('.ProseMirror')
      if (proseMirrorElement) {
        setEditorReady(true)
      }
    }, 100)

    return () => clearTimeout(timer)
  }, [editor])

  useEffect(() => {
    if (!editor || !editorReady) return

    const handleMouseMove = (e: MouseEvent) => {
      try {
        const { clientX, clientY, target } = e

        // Check if hovering over the button or line itself
        if ((target as HTMLElement).closest('.table-border-button') ||
            (target as HTMLElement).closest('.table-border-line')) {
          isHoveringButtonRef.current = true
          return // Keep current hovered line
        }

        isHoveringButtonRef.current = false

        const tableElement = (target as HTMLElement).closest('table')

        if (!tableElement) {
          setHoveredLine(null)
          return
        }

        const tableRect = tableElement.getBoundingClientRect()
        const rows = tableElement.querySelectorAll('tr')

        const HOVER_DISTANCE = 8 // Distance from border to trigger hover

        // Check horizontal borders (between rows)
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i]
          const rowRect = row.getBoundingClientRect()

          // Check top border
          // Skip the top border of the first row (header row) - can't insert before header
          if (i > 0) {
            const distanceFromTop = Math.abs(clientY - rowRect.top)
            if (distanceFromTop <= HOVER_DISTANCE &&
                clientX >= tableRect.left &&
                clientX <= tableRect.right) {
              setHoveredLine({
                top: rowRect.top,
                left: tableRect.left,
                width: tableRect.width,
                height: 0,
                type: 'horizontal',
                insertType: 'row-before'
              })
              return
            }
          }

          // Check bottom border (of last row)
          if (i === rows.length - 1) {
            const distanceFromBottom = Math.abs(clientY - rowRect.bottom)
            if (distanceFromBottom <= HOVER_DISTANCE &&
                clientX >= tableRect.left &&
                clientX <= tableRect.right) {
              setHoveredLine({
                top: rowRect.bottom,
                left: tableRect.left,
                width: tableRect.width,
                height: 0,
                type: 'horizontal',
                insertType: 'row-after'
              })
              return
            }
          }
        }

        // Check vertical borders (between columns)
        const firstRow = rows[0]
        if (firstRow) {
          const cells = firstRow.querySelectorAll('th, td')

          for (let i = 0; i < cells.length; i++) {
            const cell = cells[i]
            const cellRect = cell.getBoundingClientRect()

            // Check left border
            const distanceFromLeft = Math.abs(clientX - cellRect.left)
            if (distanceFromLeft <= HOVER_DISTANCE &&
                clientY >= tableRect.top &&
                clientY <= tableRect.bottom) {
              setHoveredLine({
                top: tableRect.top,
                left: cellRect.left,
                width: 0,
                height: tableRect.height,
                type: 'vertical',
                insertType: 'col-before'
              })
              return
            }

            // Check right border (of last column)
            if (i === cells.length - 1) {
              const distanceFromRight = Math.abs(clientX - cellRect.right)
              if (distanceFromRight <= HOVER_DISTANCE &&
                  clientY >= tableRect.top &&
                  clientY <= tableRect.bottom) {
                setHoveredLine({
                  top: tableRect.top,
                  left: cellRect.right,
                  width: 0,
                  height: tableRect.height,
                  type: 'vertical',
                  insertType: 'col-after'
                })
                return
              }
            }
          }
        }

        // No border hovered
        if (!isHoveringButtonRef.current) {
          setHoveredLine(null)
        }
      } catch (error) {
        console.error('[TableWidget] Error in mouse move:', error)
      }
    }

    const handleMouseLeave = () => {
      if (!isHoveringButtonRef.current) {
        setHoveredLine(null)
      }
    }

    const proseMirrorElement = document.querySelector('.ProseMirror')

    if (proseMirrorElement) {
      proseMirrorElement.addEventListener('mousemove', handleMouseMove as EventListener)
      proseMirrorElement.addEventListener('mouseleave', handleMouseLeave as EventListener)
    }

    return () => {
      if (proseMirrorElement) {
        proseMirrorElement.removeEventListener('mousemove', handleMouseMove as EventListener)
        proseMirrorElement.removeEventListener('mouseleave', handleMouseLeave as EventListener)
      }
    }
  }, [editor, editorReady])

  const handleLineClick = (e?: React.MouseEvent) => {
    // Prevent event bubbling to avoid double-clicks
    if (e) {
      e.stopPropagation()
      e.preventDefault()
    }

    if (!editor || !hoveredLine) return

    try {
      const view = editor.ctx.get(editorViewCtx)
      const table = document.querySelector('table')
      if (!table) return

      // For rows, we need to select a cell from a DATA row (not header row)
      // to ensure addRowBefore/After copies the correct cell structure
      // For columns, any cell works
      let cell: Element | null = null

      if (hoveredLine.insertType === 'row-before' || hoveredLine.insertType === 'row-after') {
        // Find a td (data cell) instead of th (header cell)
        cell = table.querySelector('td')
      } else {
        // For columns, any cell works
        cell = table.querySelector('td, th')
      }

      if (!cell) return

      // Set selection to the cell
      const pos = view.posAtDOM(cell, 0)
      const $pos = view.state.doc.resolve(pos)
      const selection = TextSelection.near($pos)
      if (selection) {
        const tr = view.state.tr.setSelection(selection)
        view.dispatch(tr)
      }
      view.focus()

      // Wait a moment for selection to update, then execute command
      setTimeout(() => {
        try {
          const insertType = hoveredLine.insertType
          const currentView = editor.ctx.get(editorViewCtx)
          const { state, dispatch } = currentView

          // Make sure we're in a table
          if (!isInTable(state)) {
            console.warn('[TableWidget] Not in table context after selection')
            return
          }

          // Use Milkdown GFM commands - they handle alignment properly
          switch (insertType) {
            case 'row-before':
              editor.action(callCommand(addRowBeforeCommand.key))
              break
            case 'row-after':
              editor.action(callCommand(addRowAfterCommand.key))
              break
            case 'col-before':
              editor.action(callCommand(addColBeforeCommand.key))
              break
            case 'col-after':
              editor.action(callCommand(addColAfterCommand.key))
              break
          }
        } catch (cmdError) {
          console.error('[TableWidget] Error executing command:', cmdError)
        }
      }, 50)

      setHoveredLine(null)
    } catch (error) {
      console.error('[TableWidget] Error executing table command:', error)
    }
  }

  return (
    <div ref={containerRef} className="table-widget-container">
      {hoveredLine && (
        <>
          {/* Hoverable border line */}
          <div
            className={`table-border-line ${hoveredLine.type}`}
            style={{
              position: 'fixed',
              top: `${hoveredLine.top}px`,
              left: `${hoveredLine.left}px`,
              width: hoveredLine.type === 'horizontal' ? `${hoveredLine.width}px` : '3px',
              height: hoveredLine.type === 'vertical' ? `${hoveredLine.height}px` : '3px',
              zIndex: 999,
            }}
          />
          {/* Plus button - positioned at left for rows, top for columns */}
          <button
            className="table-border-button"
            style={{
              position: 'fixed',
              top: hoveredLine.type === 'horizontal'
                ? `${hoveredLine.top - 12}px`  // Centered on horizontal line
                : `${hoveredLine.top - 12}px`,  // At the top for vertical line
              left: hoveredLine.type === 'vertical'
                ? `${hoveredLine.left - 12}px`  // Centered on vertical line
                : `${hoveredLine.left - 12}px`,  // At the left for horizontal line
              zIndex: 1000,
            }}
            onClick={handleLineClick}
            onMouseEnter={() => {
              isHoveringButtonRef.current = true
            }}
            onMouseLeave={() => {
              isHoveringButtonRef.current = false
            }}
          >
            +
          </button>
        </>
      )}
    </div>
  )
}
