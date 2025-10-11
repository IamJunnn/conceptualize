# Graph View Enhancement Plan

**Status: ✅ COMPLETED**

## Current State
- Graph only displays **files** as nodes
- Connections are based on wiki-links `[[...]]` between markdown files
- Folder structure is completely ignored in the visualization

## Proposed Changes

### Overview
Transform the graph to show both **folder hierarchy** and **file connections** in a unified view.

### Node Types

1. **Root Folder Node**
   - Represents the main MicroGrid folder path
   - **Size**: Larger than all other nodes
   - **Color**: Pastel purple (matching app theme)
   - **Shape**: Circle
   - **Label**: Folder name/path chosen by user

2. **Subfolder Nodes**
   - Represent folders within the structure
   - **Size**: Normal size (same as current file nodes)
   - **Color**: Pastel purple
   - **Shape**: Circle
   - **Label**: Folder name

3. **File Nodes**
   - Represent markdown files
   - **Size**: Normal size (current implementation)
   - **Color**: Keep existing color scheme (blue, purple, pink based on connections)
   - **Shape**: Circle
   - **Label**: File name (without .md extension)

### Edge Types

1. **Structural Edges** (Hierarchy)
   - Connect folders to their parent folder
   - Connect files to their containing folder
   - **Style**: Gray, subtle, lower opacity
   - **Purpose**: Show organizational structure

2. **Conceptual Edges** (Wiki-links)
   - Connect files that reference each other via `[[wiki-links]]`
   - **Style**: Colored (keep existing implementation)
   - **Purpose**: Show conceptual relationships between notes

### Visual Example

```
MG_TESTING (root - large pastel purple)
│
├─── ecoblox (pastel purple circle)
│
├─── energy (pastel purple circle)
│
├─── lw (pastel purple circle)
│
└─── slcc (pastel purple circle)
     ├─── testing_slcc (blue circle) ──────┐
     │                                      │ wiki-link
     ├─── asdf (blue circle) ◄──────────────┤
     │                                      │
     └─── testing2 (blue circle) ──────────┘
```

### Display Rules

1. **Always show all folders** - no collapsing or hiding
2. **Always show all files** - current behavior maintained
3. **Maintain both edge types** - structural + conceptual connections visible simultaneously

### Technical Considerations

1. Modify `graphUtils.ts` to:
   - Extract folder structure from file paths
   - Create folder nodes in addition to file nodes
   - Generate structural edges for hierarchy
   - Keep existing wiki-link edge generation

2. Update `GraphEngine.tsx` to:
   - Render different node styles based on type (root/folder/file)
   - Apply different edge styles based on type (structural/conceptual)
   - Adjust force simulation parameters to handle increased node count

3. Maintain existing features:
   - Drag nodes
   - Zoom/pan
   - Click/double-click interactions
   - Node sizing based on connections

### Benefits

- Users see **where** their notes are organized (structure)
- Users see **how** their notes connect conceptually (relationships)
- Better understanding of knowledge base topology
- Easier to identify organizational patterns and gaps

---

## Implementation Summary

### Changes Made

#### 1. **graphUtils.ts** ([src/utils/graphUtils.ts](src/utils/graphUtils.ts))

**New Types:**
- Added `NodeType` type: `'root' | 'folder' | 'file'`
- Added `EdgeType` type: `'structural' | 'conceptual'`
- Updated `GraphNode` interface to include `type: NodeType`
- Updated `GraphLink` interface to include `type: EdgeType`

**New Functions:**
- `getParentFolder(filePath)` - Extracts parent folder from file path
- `getFolderName(folderPath)` - Gets folder name from folder path
- `extractFolderStructure(filePaths)` - Extracts all unique folders from file paths

**Updated Functions:**
- `buildGraphFromFiles()` - Now creates:
  - Root folder node (larger, pastel purple)
  - Subfolder nodes (pastel purple)
  - File nodes (color based on wiki-link connections)
  - Structural edges (gray, subtle) for folder hierarchy
  - Conceptual edges (colored) for wiki-links between files
- `getNodeColor()` - Now accepts `nodeType` parameter for type-based coloring
- `getNodeSize()` - Now accepts `nodeType` parameter for type-based sizing

#### 2. **GraphEngine.tsx** ([src/components/GraphEngine.tsx](src/components/GraphEngine.tsx))

**Updated Rendering:**
- **Edge rendering**: Different styles for structural (gray, 0.3 opacity) vs conceptual edges (colored, 0.6 opacity)
- **Node rendering**:
  - Root nodes: 24px radius, pastel purple (#c4b5fd), bold labels
  - Folder nodes: Normal size, pastel purple, bold labels
  - File nodes: Size/color based on conceptual connections only
- **Labels**: Larger font (14px) and bold for root, lighter purple color for folders

**Force Simulation Adjustments:**
- Link distance: 80px for structural, 120px for conceptual
- Link strength: 0.5 for structural, 0.3 for conceptual
- Increased charge strength to -400
- Collision radius: 35px for root, 25px for others

**Helper Functions:**
- `getConceptualConnections()` - Counts only conceptual (wiki-link) connections for proper file node coloring

#### 3. **GraphView.tsx** ([src/components/GraphView.tsx](src/components/GraphView.tsx))

**Updated Stats Display:**
- Now shows: `X files • Y folders • Z wiki-links`
- Separates counts by node/edge type for better clarity

### Visual Results

The graph now displays:
- **Large pastel purple circles** for the root folder
- **Medium pastel purple circles** for subfolders
- **Colored circles** for files (gray/blue/purple/pink based on wiki-link connections)
- **Subtle gray lines** showing folder hierarchy
- **Colored lines** showing wiki-link relationships
- **All nodes and connections visible simultaneously**

### Testing

✓ TypeScript compilation successful (no errors in modified files)
✓ Type safety maintained with proper TypeScript types
✓ All existing features preserved (drag, zoom, click interactions)
✓ Force simulation optimized for increased node count