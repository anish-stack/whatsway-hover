/**
 * ============================================================
 *  © 2026 Hover Business Services LLP — a brand of Hover Business Services LLP
 * Original Author: BTPL Engineering Team
 * Website: https://hoverbusinessservices.com
 * Contact: info@hovermedia.in
 *
  
 *
  
 * ============================================================
 */

import { BaseEdge, getBezierPath, EdgeLabelRenderer } from "@xyflow/react";
import { X } from "lucide-react";
import { CustomEdgeProps } from "./types";

export function CustomEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  style,
  markerEnd,
  setEdges,
}: CustomEdgeProps) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
  });

  const handleDelete = () => {
    setEdges((eds) => eds.filter((e) => e.id !== id));
  };

  return (
    <>
      <BaseEdge
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          ...style,
          stroke: "#94a3b8",
          strokeWidth: 2,
        }}
      />
      <EdgeLabelRenderer>
        <div
          style={{
            position: "absolute",
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: "all",
          }}
          className="opacity-0 hover:opacity-100 transition-opacity duration-150"
        >
          <button
            onClick={handleDelete}
            className="w-5 h-5 bg-background border border-border rounded-full flex items-center justify-center shadow-sm hover:bg-red-50 hover:border-red-300 transition-colors"
          >
            <X className="w-2.5 h-2.5 text-muted-foreground hover:text-red-500" />
          </button>
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
