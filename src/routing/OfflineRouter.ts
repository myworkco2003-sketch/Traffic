import { loadOfflineGraph } from "./OfflineGraphLoader";

type GraphNode = {
  lon: number;
  lat: number;
  type?: string;
};

type GraphEdge = {
  source: number;
  target: number;
  cost: number;
  reverse_cost?: number;
  edge_type: "walk" | "bus" | "transfer";
  route_name?: string;
  geojson?: string;
};

type OfflineGraph = {
  version: string;
  metadata?: any;
  nodes: Record<string, GraphNode>;
  edges: Record<string, GraphEdge>;
};

type Neighbor = {
  nodeId: number;
  cost: number;
  edge: GraphEdge;
  reversed: boolean;
};

export type OfflineRouteStep = {
  step_order: number;
  edge_type: "walk" | "transfer" | "bus";
  route_name: string;
  duration_minutes: number;
  waiting_minutes?: number;
  geojson: string;
};

export type OfflineRouteResponse = {
  steps: OfflineRouteStep[];
  total_duration_minutes: number;
};

let graphPromise: Promise<OfflineGraph> | null = null;

async function getGraph(): Promise<OfflineGraph> {
  if (!graphPromise) {
    graphPromise = loadOfflineGraph() as Promise<OfflineGraph>;
  }

  return graphPromise;
}

function haversineMeters(
  lon1: number,
  lat1: number,
  lon2: number,
  lat2: number,
): number {
  const R = 6371000;

  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;

  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function findNearestStreetNode(
  graph: OfflineGraph,
  lon: number,
  lat: number,
): number {
  let nearestNode = -1;
  let nearestDistance = Infinity;

  for (const [id, node] of Object.entries(graph.nodes)) {
    if (node.type && node.type !== "street") {
      continue;
    }

    const distance = haversineMeters(
      lon,
      lat,
      Number(node.lon),
      Number(node.lat),
    );
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestNode = Number(id);
    }
  }

  if (nearestNode === -1) {
    throw new Error("No street node found in offline graph");
  }

  return nearestNode;
}

function buildAdjacency(graph: OfflineGraph): Map<number, Neighbor[]> {
  const adjacency = new Map<number, Neighbor[]>();

  for (const edge of Object.values(graph.edges)) {
    const source = Number(edge.source);
    const target = Number(edge.target);

    if (!adjacency.has(source)) {
      adjacency.set(source, []);
    }

    adjacency.get(source)!.push({
      nodeId: target,
      cost: Number(edge.cost),
      edge,
      reversed: false,
    });

    if (
      edge.reverse_cost !== undefined &&
      Number.isFinite(Number(edge.reverse_cost)) &&
      Number(edge.reverse_cost) >= 0
    ) {
      if (!adjacency.has(target)) {
        adjacency.set(target, []);
      }

      adjacency.get(target)!.push({
        nodeId: source,
        cost: Number(edge.reverse_cost),
        edge,
        reversed: true,
      });
    }
  }

  return adjacency;
}

class MinHeap {
  private heap: { node: number; distance: number }[] = [];

  push(item: { node: number; distance: number }) {
    this.heap.push(item);

    let index = this.heap.length - 1;

    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);

      if (this.heap[parent].distance <= this.heap[index].distance) {
        break;
      }

      [this.heap[parent], this.heap[index]] = [
        this.heap[index],
        this.heap[parent],
      ];

      index = parent;
    }
  }

  pop(): { node: number; distance: number } | undefined {
    if (this.heap.length === 0) {
      return undefined;
    }

    const first = this.heap[0];
    const last = this.heap.pop()!;

    if (this.heap.length > 0) {
      this.heap[0] = last;

      let index = 0;

      while (true) {
        const left = index * 2 + 1;
        const right = index * 2 + 2;

        let smallest = index;

        if (
          left < this.heap.length &&
          this.heap[left].distance < this.heap[smallest].distance
        ) {
          smallest = left;
        }

        if (
          right < this.heap.length &&
          this.heap[right].distance < this.heap[smallest].distance
        ) {
          smallest = right;
        }

        if (smallest === index) {
          break;
        }

        [this.heap[index], this.heap[smallest]] = [
          this.heap[smallest],
          this.heap[index],
        ];

        index = smallest;
      }
    }

    return first;
  }

  get size() {
    return this.heap.length;
  }
}

type PreviousEntry = {
  node: number;
  edge: GraphEdge;
  reversed: boolean;
  cost: number;
};

function dijkstra(
  graph: OfflineGraph,
  startNode: number,
  targetNode: number,
): PreviousEntry[] {
  const adjacency = buildAdjacency(graph);

  const distances = new Map<number, number>();
  const previous = new Map<number, PreviousEntry>();

  const heap = new MinHeap();

  distances.set(startNode, 0);
  heap.push({
    node: startNode,
    distance: 0,
  });

  while (heap.size > 0) {
    const current = heap.pop()!;

    const knownDistance = distances.get(current.node);

    if (knownDistance === undefined || current.distance !== knownDistance) {
      continue;
    }

    if (current.node === targetNode) {
      break;
    }

    const neighbors = adjacency.get(current.node) ?? [];

    for (const neighbor of neighbors) {
      const newDistance = current.distance + neighbor.cost;

      const oldDistance = distances.get(neighbor.nodeId);

      if (oldDistance === undefined || newDistance < oldDistance) {
        distances.set(neighbor.nodeId, newDistance);

        previous.set(neighbor.nodeId, {
          node: current.node,
          edge: neighbor.edge,
          reversed: neighbor.reversed,
          cost: neighbor.cost,
        });

        heap.push({
          node: neighbor.nodeId,
          distance: newDistance,
        });
      }
    }
  }

  if (startNode !== targetNode && !previous.has(targetNode)) {
    throw new Error("No route found in offline graph");
  }

  const result: PreviousEntry[] = [];

  let currentNode = targetNode;

  while (currentNode !== startNode) {
    const prev = previous.get(currentNode);

    if (!prev) {
      throw new Error("Failed to reconstruct offline route");
    }

    result.unshift(prev);

    currentNode = prev.node;
  }

  return result;
}

function parseGeoJson(edge: GraphEdge): any | null {
  if (!edge.geojson) {
    return null;
  }

  try {
    return JSON.parse(edge.geojson);
  } catch {
    return null;
  }
}

function mergeGeoJson(edges: PreviousEntry[]): string {
  const coordinates: number[][] = [];

  for (const item of edges) {
    const geometry = parseGeoJson(item.edge);
    if (
      !geometry ||
      (geometry.type === "Feature" && !geometry.geometry?.coordinates) ||
      (geometry.type === "LineString" && !geometry.coordinates)
    ) {
    }

    if (!geometry) {
      continue;
    }

    let edgeCoordinates: number[][] = [];

    if (geometry.type === "Feature") {
      edgeCoordinates = geometry.geometry?.coordinates ?? [];
    } else if (geometry.type === "LineString") {
      edgeCoordinates = geometry.coordinates ?? [];
    }

    if (item.reversed) {
      edgeCoordinates = [...edgeCoordinates].reverse();
    }

    for (const coordinate of edgeCoordinates) {
      if (
        coordinates.length === 0 ||
        coordinates[coordinates.length - 1][0] !== coordinate[0] ||
        coordinates[coordinates.length - 1][1] !== coordinate[1]
      ) {
        coordinates.push(coordinate);
      }
    }
  }

  return JSON.stringify({
    type: "Feature",
    properties: {},
    geometry: {
      type: "LineString",
      coordinates,
    },
  });
}

function getRouteName(edge: GraphEdge): string {
  if (edge.edge_type === "bus") {
    return edge.route_name ?? "Bus";
  }

  if (edge.edge_type === "transfer") {
    return "Walk/Wait Transfer";
  }

  return "Walking Path";
}

function groupRouteSteps(path: PreviousEntry[]): OfflineRouteStep[] {
  const steps: OfflineRouteStep[] = [];

  let currentEdges: PreviousEntry[] = [];

  let currentType: "walk" | "transfer" | "bus" | null = null;

  let currentRouteName = "";

  const flush = () => {
    if (currentEdges.length === 0 || !currentType) {
      return;
    }

    const totalSeconds = currentEdges.reduce((sum, item) => sum + item.cost, 0);

    steps.push({
      step_order: steps.length + 1,
      edge_type: currentType,
      route_name: currentRouteName,
      duration_minutes: Math.round((totalSeconds / 60) * 10) / 10,
      geojson: mergeGeoJson(currentEdges),
    });

    currentEdges = [];
  };

  for (const item of path) {
    const type = item.edge.edge_type;
    const routeName = getRouteName(item.edge);

    const sameGroup = currentType === type && currentRouteName === routeName;

    if (!sameGroup) {
      flush();

      currentType = type;
      currentRouteName = routeName;
    }

    currentEdges.push(item);
  }

  flush();

  return steps;
}

export async function routeOffline(
  originLon: number,
  originLat: number,
  destinationLon: number,
  destinationLat: number,
): Promise<OfflineRouteResponse> {
  const graph = await getGraph();

  const startNode = findNearestStreetNode(graph, originLon, originLat);

  const targetNode = findNearestStreetNode(
    graph,
    destinationLon,
    destinationLat,
  );

  const path = dijkstra(graph, startNode, targetNode);

  const steps = groupRouteSteps(path);

  const totalDuration = steps.reduce(
    (sum, step) => sum + step.duration_minutes,
    0,
  );

  return {
    steps,
    total_duration_minutes: Math.round(totalDuration * 10) / 10,
  };
}
