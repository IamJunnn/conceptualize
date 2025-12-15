import { $view } from '@milkdown/utils'
import { imageSchema } from '@milkdown/preset-commonmark'

interface ResizeState {
  isResizing: boolean
  startWidth: number
  startHeight: number
  startX: number
  startY: number
  aspectRatio: number
}

// Custom NodeView for images with resize handles
class ImageNodeView {
  dom: HTMLElement
  img: HTMLImageElement
  handle: HTMLElement
  resizeState: ResizeState

  constructor(node: any, view: any, getPos: () => number) {
    this.resizeState = {
      isResizing: false,
      startWidth: 0,
      startHeight: 0,
      startX: 0,
      startY: 0,
      aspectRatio: 1,
    }

    // Create wrapper container
    this.dom = document.createElement('div')
    this.dom.className = 'image-resize-wrapper'
    this.dom.style.position = 'relative'
    this.dom.style.display = 'inline-block'
    this.dom.style.maxWidth = '100%'
    this.dom.style.userSelect = 'none'

    // Create image element
    this.img = document.createElement('img')
    this.img.src = node.attrs.src
    this.img.alt = node.attrs.alt || ''
    this.img.title = node.attrs.title || ''
    this.img.draggable = false // Disable dragging
    this.img.style.cursor = 'default' // Default cursor

    // Apply width/height if specified
    if (node.attrs.width) {
      this.img.style.width = `${node.attrs.width}px`
    }
    if (node.attrs.height) {
      this.img.style.height = `${node.attrs.height}px`
    }

    this.img.style.display = 'block'
    this.img.style.maxWidth = '100%'

    // Create resize handle
    this.handle = document.createElement('div')
    this.handle.className = 'image-resize-handle'
    this.handle.style.position = 'absolute'
    this.handle.style.bottom = '-6px'
    this.handle.style.right = '-6px'
    this.handle.style.width = '16px'
    this.handle.style.height = '16px'
    this.handle.style.backgroundColor = '#64c8ca'
    this.handle.style.border = '2px solid white'
    this.handle.style.borderRadius = '3px'
    this.handle.style.cursor = 'nwse-resize'
    this.handle.style.zIndex = '100'
    this.handle.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.3)'
    this.handle.style.pointerEvents = 'auto'
    this.handle.style.display = 'none' // Hidden by default

    // Add mousedown handler for resize
    this.handle.addEventListener('mousedown', this.handleMouseDown.bind(this, view, getPos))

    // Show/hide handle on selection
    this.dom.addEventListener('click', () => {
      this.handle.style.display = 'block'
    })

    // Hide handle when clicking outside
    document.addEventListener('click', (e) => {
      if (!this.dom.contains(e.target as Node)) {
        this.handle.style.display = 'none'
      }
    })

    // Assemble DOM
    this.dom.appendChild(this.img)
    this.dom.appendChild(this.handle)
  }

  handleMouseDown(view: any, getPos: () => number, e: MouseEvent) {
    e.preventDefault()
    e.stopPropagation()

    const pos = getPos()
    const node = view.state.doc.nodeAt(pos)
    if (!node) return

    this.resizeState.isResizing = true
    this.resizeState.startX = e.clientX
    this.resizeState.startY = e.clientY
    this.resizeState.startWidth = this.img.clientWidth || this.img.naturalWidth
    this.resizeState.startHeight = this.img.clientHeight || this.img.naturalHeight
    this.resizeState.aspectRatio = this.resizeState.startWidth / this.resizeState.startHeight

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!this.resizeState.isResizing) return

      const deltaX = moveEvent.clientX - this.resizeState.startX
      const newWidth = Math.max(50, this.resizeState.startWidth + deltaX)
      const newHeight = newWidth / this.resizeState.aspectRatio

      this.img.style.width = `${newWidth}px`
      this.img.style.height = `${newHeight}px`
    }

    const handleMouseUp = () => {
      if (this.resizeState.isResizing) {
        const finalWidth = this.img.clientWidth
        const finalHeight = this.img.clientHeight

        // Update the ProseMirror node with new dimensions
        const { state, dispatch } = view
        const transaction = state.tr.setNodeMarkup(pos, null, {
          ...node.attrs,
          width: finalWidth,
          height: finalHeight,
        })

        dispatch(transaction)
        this.resizeState.isResizing = false
      }

      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }

  update(node: any) {
    if (node.type.name !== 'image') return false

    // Update image attributes if changed
    this.img.src = node.attrs.src
    this.img.alt = node.attrs.alt || ''
    this.img.title = node.attrs.title || ''

    if (node.attrs.width) {
      this.img.style.width = `${node.attrs.width}px`
    }
    if (node.attrs.height) {
      this.img.style.height = `${node.attrs.height}px`
    }

    return true
  }

  destroy() {
    // Cleanup if needed
    this.dom.remove()
  }

  stopEvent(event: Event) {
    // Stop mousedown on resize handle - we handle it ourselves
    if (event.type === 'mousedown' && event.target === this.handle) {
      return true
    }
    // Don't stop other events - let ProseMirror handle them
    return false
  }

  // This tells ProseMirror to ignore DOM mutations (for resize)
  ignoreMutation() {
    return true
  }

  // Show handle when image is selected (clicked)
  selectNode() {
    this.dom.classList.add('ProseMirror-selectednode')
    this.handle.style.display = 'block'
  }

  // Hide handle when image is deselected
  deselectNode() {
    this.dom.classList.remove('ProseMirror-selectednode')
    this.handle.style.display = 'none'
  }
}

export const imageResizePlugin = () => {
  return $view(imageSchema.node, () => (node, view, getPos) => {
    return new ImageNodeView(node, view, getPos as () => number)
  })
}
