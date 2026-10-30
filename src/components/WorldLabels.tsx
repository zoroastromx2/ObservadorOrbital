import React from "react";
import { Satellite } from "../types/orbital";

export interface ProjectedLabel {
  sat: Satellite;
  x: number;
  y: number;
  transform?: string;
}

interface WorldLabelsProps {
  labels: ProjectedLabel[];
}

export const WorldLabels: React.FC<WorldLabelsProps> = ({ labels }) => {
  return (
    <div id="labelLayer" className="label-layer" aria-hidden="true">
      {labels.map((item) => (
        <span
          key={item.sat.noradId}
          className="sat-label"
          style={
            {
              left: `${item.x}px`,
              top: `${item.y}px`,
              transform: item.transform,
              "--group-color": item.sat.color,
            } as React.CSSProperties
          }
        >
          {item.sat.name}
        </span>
      ))}
    </div>
  );
};
