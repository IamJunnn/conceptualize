import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { GraphNode, GraphLink, GraphData } from '../utils/graphUtils';
import './GraphEngine.css';

interface GraphEngineProps {
  data: GraphData;
  onNodeClick?: (node: GraphNode) => void;
  onNodeDoubleClick?: (node: GraphNode) => void;
}

const GraphEngine: React.FC<GraphEngineProps> = ({ data, onNodeClick, onNodeDoubleClick }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

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
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
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
        if ((d as GraphNode).type === 'root') return 35;
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
        if (d.type === 'root') return 24;

        // For files, size based on conceptual connections
        const conceptualConnections = getConceptualConnections(d.id);
        const baseSize = 8;
        const maxSize = 20;
        return Math.min(baseSize + conceptualConnections * 1.5, maxSize);
      })
      .attr('fill', d => {
        // Folders (root and subfolders) are purple
        if (d.type === 'root' || d.type === 'folder') {
          return '#c4b5fd'; // pastel purple
        }

        // Files: blue for markdown, gray for other file types
        if (d.fileType === 'markdown') {
          return '#3b82f6'; // blue
        }
        return '#6b7280'; // gray
      })
      .attr('stroke', '#1a1a1a')
      .attr('stroke-width', 2)
      .style('cursor', 'pointer');

    // Add labels with type-specific styling
    node.append('text')
      .text(d => d.name)
      .attr('class', 'node-label')
      .attr('dx', 12)
      .attr('dy', 4)
      .style('font-size', d => d.type === 'root' ? '14px' : '12px')
      .style('font-weight', d => (d.type === 'root' || d.type === 'folder') ? '600' : '400')
      .style('fill', d => (d.type === 'root' || d.type === 'folder') ? '#e9d5ff' : '#d4d4d4')
      .style('pointer-events', 'none')
      .style('user-select', 'none');

    // Add drag behavior
    const drag = d3.drag<SVGGElement, GraphNode>()
      .on('start', (event, d) => {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on('drag', (event, d) => {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on('end', (event, d) => {
        if (!event.active) simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      });

    node.call(drag);

    // Add click handlers
    node.on('click', (event, d) => {
      event.stopPropagation();
      if (onNodeClick) onNodeClick(d);
    });

    node.on('dblclick', (event, d) => {
      event.stopPropagation();
      if (onNodeDoubleClick) onNodeDoubleClick(d);
    });

    // Add hover effects
    node.on('mouseenter', function() {
      d3.select(this).select('circle')
        .transition()
        .duration(200)
        .attr('r', function() {
          const currentR = parseFloat(d3.select(this).attr('r'));
          return currentR * 1.3;
        })
        .attr('stroke-width', 3);
    });

    node.on('mouseleave', function() {
      d3.select(this).select('circle')
        .transition()
        .duration(200)
        .attr('r', (d: any) => {
          const node = d as GraphNode;
          // Root node is larger
          if (node.type === 'root') return 24;

          // For files, size based on conceptual connections
          const conceptualConnections = getConceptualConnections(node.id);
          const baseSize = 8;
          const maxSize = 20;
          return Math.min(baseSize + conceptualConnections * 1.5, maxSize);
        })
        .attr('stroke-width', 2);
    });

    // Update positions on each tick
    simulation.on('tick', () => {
      link
        .attr('x1', d => (d.source as GraphNode).x || 0)
        .attr('y1', d => (d.source as GraphNode).y || 0)
        .attr('x2', d => (d.target as GraphNode).x || 0)
        .attr('y2', d => (d.target as GraphNode).y || 0);

      node.attr('transform', d => `translate(${d.x},${d.y})`);
    });

    // Cleanup
    return () => {
      simulation.stop();
    };
  }, [data, dimensions, onNodeClick, onNodeDoubleClick]);

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
          <strong>Controls:</strong> Drag nodes • Scroll to zoom • Double-click to open
        </div>
      </div>
    </div>
  );
};

export default GraphEngine;
