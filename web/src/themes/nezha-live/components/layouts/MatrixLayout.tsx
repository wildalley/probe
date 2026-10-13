import React from "react";
import { ThemeNode } from "../../types";
import { NodeCard } from "../NodeCard";

interface MatrixLayoutProps {
  nodes: ThemeNode[];
  onSelectNode: (node: ThemeNode) => void;
}

export const MatrixLayout: React.FC<MatrixLayoutProps> = ({ nodes, onSelectNode }) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 py-2">
      {nodes.map((node) => (
        <NodeCard
          key={node.id}
          node={node}
          compact={false}
          onClick={() => onSelectNode(node)}
        />
      ))}
    </div>
  );
};
