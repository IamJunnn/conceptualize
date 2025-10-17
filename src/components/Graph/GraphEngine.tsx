import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { GraphNode, GraphLink, GraphData } from '../../utils/graphUtils';
import { isImportantNote } from '../../utils/importantNotes';
import './GraphEngine.css';

interface GraphEngineProps {
  data: GraphData;
  hiddenNodes?: GraphNode[]; // Hidden nodes to show as ghosts when zoomed in
  onNodeClick?: (node: GraphNode) => void;
  onNodeDoubleClick?: (node: GraphNode) => void;
  onNodeContextMenu?: (event: React.MouseEvent, node: GraphNode) => void;
}

const GraphEngine: React.FC<GraphEngineProps> = ({ data, hiddenNodes = [], onNodeClick, onNodeDoubleClick, onNodeContextMenu }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  

  // Update dimensions on mount and resize
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight
        });
      }
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  useEffect(() => {
    if (!svgRef.current || !data.nodes.length) return;

    const svg = d3.select(svgRef.current);
    const { width, height } = dimensions;

    // Clear previous content
    svg.selectAll('*').remove();

    // Helper function to count conceptual connections for a node
    const getConceptualConnections = (nodeId: string): number => {
      return data.links.filter(
        l => l.type === 'conceptual' && (
          (typeof l.source === 'object' ? l.source.id : l.source) === nodeId ||
          (typeof l.target === 'object' ? l.target.id : l.target) === nodeId
        )
      ).length;
    };

    // Create main group for zoom/pan
    const g = svg.append('g');

    // Add zoom behavior
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .filter((event) => !event.button && event.type !== 'dblclick')
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
        
        const ghostNodeGroup = svg.select('.ghost-nodes');
        if (ghostNodeGroup.empty()) return;

        if (event.transform.k > 0.9) {
          ghostNodeGroup.style('opacity', 1);
        } else {
          ghostNodeGroup.style('opacity', 0);
        }
      });

    svg.call(zoom);

    // Create force simulation with adjusted parameters for more nodes
    const simulation = d3.forceSimulation<GraphNode>(data.nodes)
      .force('link', d3.forceLink<GraphNode, GraphLink>(data.links)
        .id(d => d.id)
        .distance(d => (d as GraphLink).type === 'structural' ? 80 : 120) // Shorter structural links
        .strength(d => (d as GraphLink).type === 'structural' ? 0.5 : 0.3)) // Weaker structural links
      .force('charge', d3.forceManyBody().strength(-400))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide<GraphNode>().radius(d => {
        if ((d as GraphNode).type === 'root') return 28;
        return 25;
      }));

    // Create links (edges) with different styles for structural vs conceptual
    const link = g.append('g')
      .attr('class', 'links')
      .selectAll('line')
      .data(data.links)
      .enter()
      .append('line')
      .attr('class', d => `graph-link graph-link-${d.type}`)
      .attr('stroke', d => d.type === 'structural' ? '#c4b5fd' : '#60a5fa') // Purple for structural, blue for conceptual
      .attr('stroke-opacity', d => d.type === 'structural' ? 0.6 : 0.8)
      .attr('stroke-width', d => d.type === 'structural' ? 2 : 2.5);

    // Create node groups
    const node = g.append('g')
      .attr('class', 'nodes')
      .selectAll<SVGGElement, GraphNode>('g')
      .data(data.nodes)
      .enter()
      .append('g')
      .attr('class', 'graph-node');

    // Add circles for nodes with type-based styling
    node.append('circle')
      .attr('r', d => {
        // Root node is larger
        if (d.type === 'root') return 18;

        // For files, size based on conceptual connections
        const conceptualConnections = getConceptualConnections(d.id);
        const baseSize = 8;
        const maxSize = 20;
        return Math.min(baseSize + conceptualConnections * 1.5, maxSize);
      })
      .attr('fill', d => {
        // Root folder is purple #64c8ca
        if (d.type === 'root') {
          return '#4b64ae'; // purple
        }
        // Subfolders are pastel purple
        if (d.type === 'folder') {
          return '#ecd1cd'; // pastel purple
        }

        // Files: check if important first (applies to all file types)
        if (d.type === 'file' && isImportantNote(d.path)) {
          return '#fbbf24'; // yellow/gold for important files (any type)
        }

        // Regular files: blue for markdown, gray for other file types
        if (d.fileType === 'markdown') {
          return '#64c8ca'; // blue
        }
        return '#6b7280'; // gray
      })
      .attr('stroke', '#1a1a1a')
      .attr('stroke-width', 2)
      .style('cursor', 'pointer');

    // Add labels with type-specific styling (excluding root)
    node.append('text')
      .text(d => d.type === 'root' ? '' : d.name) // Don't show label for root
      .attr('class', 'node-label')
      .attr('dx', 12)
      .attr('dy', 4)
      .style('font-size', d => d.type === 'root' ? '14px' : '12px')
      .style('font-weight', d => (d.type === 'root' || d.type === 'folder') ? '600' : '400')
      .style('fill', d => {
        if (d.type === 'root') return '#64c8ca'; // purple for root
        if (d.type === 'folder') return 'white'; // pastel purple for folders
        return '#d4d4d4'; // gray for files
      })
      .style('pointer-events', 'none')
      .style('user-select', 'none');

    // Create ghost nodes for hidden items (shown when zoomed > 0.9)
    const ghostNodeGroup = g.append('g')
      .attr('class', 'ghost-nodes')
      .style('opacity', 0); // Initially hidden

    const ghostNode = ghostNodeGroup
      .selectAll<SVGGElement, GraphNode>('g')
      .data(hiddenNodes)
      .enter()
      .append('g')
      .attr('class', 'ghost-node');

    // Add ghost circles
    ghostNode.append('circle')
      .attr('r', d => {
        if (d.type === 'root') return 18;
        const conceptualConnections = getConceptualConnections(d.id);
        const baseSize = 8;
        const maxSize = 20;
        return Math.min(baseSize + conceptualConnections * 1.5, maxSize);
      })
      .attr('fill', d => {
        if (d.type === 'root') return '#64c8ca';
        if (d.type === 'folder') return '#dc7361';
        if (d.fileType === 'markdown') return '#3b82f6';
        return '#6b7280';
      })
      .attr('stroke', '#888')
      .attr('stroke-width', 2)
      .attr('stroke-dasharray', '5,5') // Dotted border
      .style('opacity', 0.4) // More visible ghost effect
      .style('pointer-events', 'none');

    // Add ghost labels
    ghostNode.append('text')
      .text(d => d.type === 'root' ? '' : d.name)
      .attr('class', 'ghost-node-label')
      .attr('dx', 12)
      .attr('dy', 4)
      .style('font-size', d => d.type === 'root' ? '14px' : '12px')
      .style('font-weight', d => (d.type === 'root' || d.type === 'folder') ? '600' : '400')
      .style('fill', '#aaa')
      .style('opacity', 0.5)
      .style('pointer-events', 'none')
      .style('user-select', 'none')
      .style('text-decoration', 'none'); // Ensure no strikethrough

    // Add title/tooltip for ghost nodes
    ghostNode.append('title')
      .text(d => `${d.name} (Hidden from graph)`);

    // Track drag state to distinguish from clicks
    let isDragging = false;
    let dragStartPos = { x: 0, y: 0 };

    // Add drag behavior
    const drag = d3.drag<SVGGElement, GraphNode>()
      .clickDistance(12)
      .on('start', (event, d) => {
        isDragging = false;
        dragStartPos = { x: event.x, y: event.y };
        if (!event.active) simulation.alphaTarget(0.1).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on('drag', (event, d) => {
        // Check if we've moved enough to be considered a drag
        const dx = Math.abs(event.x - dragStartPos.x);
        const dy = Math.abs(event.y - dragStartPos.y);
        if (dx > 10 || dy > 10) {
          isDragging = true;
        }
        d.fx = event.x;
        d.fy = event.y;
      })
      .on('end', (event, d) => {
        if (!event.active) simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
        // Reset drag flag after a short delay
        setTimeout(() => {
          isDragging = false;
        }, 10);
      });

    node.call(drag);

    // Helper function to get connected node IDs
    const getConnectedNodeIds = (nodeId: string): Set<string> => {
      const connected = new Set<string>();
      connected.add(nodeId); // Add the node itself

      data.links.forEach(link => {
        const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
        const targetId = typeof link.target === 'object' ? link.target.id : link.target;

        if (sourceId === nodeId) {
          connected.add(targetId);
        }
        if (targetId === nodeId) {
          connected.add(sourceId);
        }
      });

      return connected;
    };

    // Add click handlers
    node.on('click', (event, d) => {
      event.stopPropagation();

      // Only handle click if we're not dragging
      if (!isDragging) {
        // Toggle selection
        if (selectedNodeId === d.id) {
          setSelectedNodeId(null);
        } else {
          setSelectedNodeId(d.id);
        }

        if (onNodeClick) onNodeClick(d);
      }
    });

    node.on('dblclick', (event, d) => {
      event.stopPropagation();
      if (onNodeDoubleClick) onNodeDoubleClick(d);
    });

    node.on('contextmenu', function(event, d) {
      event.preventDefault();
      // event.stopPropagation(); // Allow click-outside to work
      if (onNodeContextMenu) {
        // Create a synthetic React event
        const syntheticEvent = {
          preventDefault: () => {},
          stopPropagation: () => {},
          clientX: event.clientX,
          clientY: event.clientY
        } as React.MouseEvent;
        onNodeContextMenu(syntheticEvent, d);
      }
    });

    // Add hover effects
    node.on('mouseenter', function(event, hoveredNodeData) {
      const connectedNodes = getConnectedNodeIds(hoveredNodeData.id);

      // Highlight/dim nodes
      node.select('circle')
        .transition()
        .duration(200)
        .style('opacity', (d: any) => connectedNodes.has(d.id) ? 1 : 0.15)
        .attr('stroke-width', (d: any) => d.id === hoveredNodeData.id ? 4 : 2);

      node.select('text')
        .transition()
        .duration(200)
        .style('opacity', (d: any) => connectedNodes.has(d.id) ? 1 : 0.15);

      // Highlight/dim links
      link
        .transition()
        .duration(200)
        .style('opacity', (d: any) => {
          const sourceId = typeof d.source === 'object' ? d.source.id : d.source;
          const targetId = typeof d.target === 'object' ? d.target.id : d.target;
          const isConnected = connectedNodes.has(sourceId) && connectedNodes.has(targetId);
          return isConnected ? (d.type === 'structural' ? 0.8 : 1) : 0.1;
        })
        .attr('stroke-width', (d: any) => {
          const sourceId = typeof d.source === 'object' ? d.source.id : d.source;
          const targetId = typeof d.target === 'object' ? d.target.id : d.target;
          const isConnected = connectedNodes.has(sourceId) && connectedNodes.has(targetId);
          return isConnected ? (d.type === 'structural' ? 2.5 : 3.5) : (d.type === 'structural' ? 2 : 2.5);
        });
    });

    node.on('mouseleave', function() {
      applyHighlighting();
    });

    // Update positions on each tick
    simulation.on('tick', () => {
      link
        .attr('x1', d => (d.source as GraphNode).x || 0)
        .attr('y1', d => (d.source as GraphNode).y || 0)
        .attr('x2', d => (d.target as GraphNode).x || 0)
        .attr('y2', d => (d.target as GraphNode).y || 0);

      node.attr('transform', d => `translate(${d.x},${d.y})`);

      // Position ghost nodes (they don't participate in simulation, use their stored positions)
      ghostNode.attr('transform', d => `translate(${d.x || 0},${d.y || 0})`);
    });

    // Apply highlighting based on selected node
    const applyHighlighting = () => {
      if (!selectedNodeId) {
        // Reset all nodes and links to normal
        node.select('circle')
          .transition()
          .duration(300)
          .style('opacity', 1)
          .attr('stroke-width', 2);

        node.select('text')
          .transition()
          .duration(300)
          .style('opacity', 1);

        link
          .transition()
          .duration(300)
          .style('opacity', d => d.type === 'structural' ? 0.6 : 0.8)
          .attr('stroke-width', d => d.type === 'structural' ? 2 : 2.5);
      } else {
        // Get connected nodes
        const connectedNodes = getConnectedNodeIds(selectedNodeId);

        // Highlight/dim nodes
        node.select('circle')
          .transition()
          .duration(300)
          .style('opacity', (d: any) => connectedNodes.has(d.id) ? 1 : 0.15)
          .attr('stroke-width', (d: any) => d.id === selectedNodeId ? 4 : 2);

        node.select('text')
          .transition()
          .duration(300)
          .style('opacity', (d: any) => connectedNodes.has(d.id) ? 1 : 0.15);

        // Highlight/dim links
        link
          .transition()
          .duration(300)
          .style('opacity', (d: any) => {
            const sourceId = typeof d.source === 'object' ? d.source.id : d.source;
            const targetId = typeof d.target === 'object' ? d.target.id : d.target;
            const isConnected = connectedNodes.has(sourceId) && connectedNodes.has(targetId);
            return isConnected ? (d.type === 'structural' ? 0.8 : 1) : 0.1;
          })
          .attr('stroke-width', (d: any) => {
            const sourceId = typeof d.source === 'object' ? d.source.id : d.source;
            const targetId = typeof d.target === 'object' ? d.target.id : d.target;
            const isConnected = connectedNodes.has(sourceId) && connectedNodes.has(targetId);
            return isConnected ? (d.type === 'structural' ? 2.5 : 3.5) : (d.type === 'structural' ? 2 : 2.5);
          });
      }
    };

    // Apply highlighting whenever selection changes
    applyHighlighting();

    // Clear selection when clicking on background
    svg.on('click', () => {
      if (selectedNodeId !== null) {
        setSelectedNodeId(null);
      }
    });

    // Cleanup
    return () => {
      simulation.stop();
    };
  }, [data, dimensions, onNodeClick, onNodeDoubleClick, onNodeContextMenu, selectedNodeId, hiddenNodes]);

  

  return (
    <div ref={containerRef} className="graph-engine-container">
      <svg
        ref={svgRef}
        width={dimensions.width}
        height={dimensions.height}
        className="graph-svg"
      />
      <div className="graph-controls">
        <div className="control-hint">
          <strong>Controls:</strong> Click to highlight connections • Double-click to open • Drag nodes • Scroll to zoom
        </div>
      </div>
    </div>
  );
};

export default GraphEngine;
