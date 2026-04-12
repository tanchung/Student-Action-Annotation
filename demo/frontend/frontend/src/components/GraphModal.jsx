import React, { useEffect, useRef } from "react";
import { X, Loader, AlertCircle, Download } from "lucide-react";
import cytoscape from "cytoscape";

const getNodeDisplayName = (node = {}) => {
  const properties = node.properties || {};
  const preferredKeys = [
    "object_name",
    "activity_name",
    "role",
    "person_name",
    "caption_text",
    "segment_name",
    "name",
    "title",
    "description",
    "mongo_id",
  ];

  for (const key of preferredKeys) {
    const value = properties[key];
    if (value != null && String(value).trim()) {
      return String(value).trim();
    }
  }

  const labels = Array.isArray(node.labels) ? node.labels.join(", ") : "Node";
  return labels;
};

const GraphModal = ({ isOpen, onClose, data, title = "Graph Visualization" }) => {
  const containerRef = useRef(null);
  const cyRef = useRef(null);
  const isLoading = isOpen && !data;

  useEffect(() => {
    if (!isOpen || !data) return;

    let isMounted = true;

    try {
      const elements = [];
      const nodeIds = new Set();

      if (Array.isArray(data.nodes)) {
        data.nodes.forEach((node) => {
          const nodeLabels = Array.isArray(node.labels) ? node.labels.join(", ") : "Node";
          const nodeLabel = getNodeDisplayName(node);

          elements.push({
            data: {
              id: String(node.id),
              label: String(nodeLabel).substring(0, 50),
              labels: nodeLabels,
              properties: node.properties || {},
            },
          });
          nodeIds.add(String(node.id));
        });
      }

      if (Array.isArray(data.relationships)) {
        data.relationships.forEach((rel, idx) => {
          const source = String(rel.start);
          const target = String(rel.end);
          if (!nodeIds.has(source) || !nodeIds.has(target)) {
            return;
          }

          elements.push({
            data: {
              id: `rel-${idx}`,
              source,
              target,
              label: rel.type || "REL",
              type: rel.type,
              properties: rel.properties || {},
            },
          });
        });
      }

      if (elements.length === 0) {
        return;
      }

      if (cyRef.current) {
        cyRef.current.destroy();
        cyRef.current = null;
      }

      const cy = cytoscape({
        container: containerRef.current,
        elements,
        style: [
          {
            selector: "node",
            style: {
              "background-color": "#0F766E",
              label: "data(label)",
              "text-valign": "center",
              "text-halign": "center",
              "font-size": "11px",
              "font-weight": "700",
              color: "#ffffff",
              width: "58px",
              height: "58px",
              "border-width": 2,
              "border-color": "#115E59",
              "text-wrap": "wrap",
              "text-max-width": "70px",
            },
          },
          {
            selector: "edge",
            style: {
              width: 2,
              "line-color": "#9CA3AF",
              "target-arrow-color": "#9CA3AF",
              "target-arrow-shape": "triangle",
              "curve-style": "bezier",
              label: "data(label)",
              "font-size": "10px",
              "text-background-opacity": 1,
              "text-background-color": "#ffffff",
              "text-background-padding": "2px",
            },
          },
        ],
        layout: {
          name: "cose",
          animate: true,
          animationDuration: 400,
          avoidOverlap: true,
          nodeRepulsion: 350000,
        },
        wheelSensitivity: 0.12,
      });

      cyRef.current = cy;

    } catch (err) {
      if (isMounted) {
        console.error("Graph render error:", err);
      }
    }

    return () => {
      isMounted = false;
      if (cyRef.current) {
        cyRef.current.destroy();
        cyRef.current = null;
      }
    };
  }, [isOpen, data]);

  const handleDownloadPNG = () => {
    if (!cyRef.current) return;
    const png = cyRef.current.png({ full: true, scale: 2 });
    const link = document.createElement("a");
    link.href = png;
    link.download = `graph-${Date.now()}.png`;
    link.click();
  };

  const handleFitView = () => {
    if (!cyRef.current) return;
    cyRef.current.fit();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-200 bg-gradient-to-r from-teal-50 to-cyan-50 p-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">{title}</h2>
            <p className="mt-1 text-sm text-gray-500">Graph nodes va relationships tu Neo4j</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 transition hover:bg-white/60">
            <X size={24} className="text-gray-600" />
          </button>
        </div>

        <div className="relative flex-1 overflow-hidden">
          {isLoading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/75">
              <div className="text-center">
                <Loader size={30} className="mx-auto mb-2 animate-spin text-teal-600" />
                <p className="text-sm text-gray-600">Dang tai graph...</p>
              </div>
            </div>
          )}

          {!isLoading && (!data?.nodes?.length || !data?.relationships) && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-red-50">
              <div className="text-center">
                <AlertCircle size={30} className="mx-auto mb-2 text-red-600" />
                <p className="text-sm font-semibold text-red-600">Khong co du lieu graph</p>
              </div>
            </div>
          )}

          <div ref={containerRef} className="h-full w-full bg-gradient-to-br from-gray-50 to-gray-100" />
        </div>

        <div className="flex items-center justify-between border-t border-gray-200 bg-gray-50 p-4">
          <div className="text-sm text-gray-600">
            <span className="font-semibold">{data?.nodes?.length || 0}</span> Nodes |{" "}
            <span className="font-semibold">{data?.relationships?.length || 0}</span> Relationships
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleFitView}
              className="rounded-lg bg-teal-50 px-4 py-2 text-sm font-semibold text-teal-700 transition hover:bg-teal-100"
            >
              Fit View
            </button>
            <button
              onClick={handleDownloadPNG}
              className="flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-700"
            >
              <Download size={16} /> Export PNG
            </button>
            <button
              onClick={onClose}
              className="rounded-lg bg-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-300"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GraphModal;
