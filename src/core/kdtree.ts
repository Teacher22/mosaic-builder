import { squaredDistance } from './color';

export interface KDPoint {
  id: number;
  features: Float32Array;
}

interface KDNode {
  point: KDPoint;
  axis: number;
  left: KDNode | null;
  right: KDNode | null;
}

export interface KDMatch {
  id: number;
  dist: number;
}

function insertSorted(arr: KDMatch[], item: KDMatch): void {
  let i = arr.length;
  arr.push(item);
  while (i > 0 && arr[i - 1].dist > arr[i].dist) {
    const tmp = arr[i - 1];
    arr[i - 1] = arr[i];
    arr[i] = tmp;
    i--;
  }
}

/** Static k-d tree over fixed-length feature vectors, for fast K-nearest queries. */
export class KDTree {
  private root: KDNode | null = null;
  private dims: number;
  private size: number;

  constructor(points: KDPoint[]) {
    this.dims = points[0]?.features.length ?? 0;
    this.size = points.length;
    this.root = this.build(points.slice(), 0);
  }

  get count(): number {
    return this.size;
  }

  private build(points: KDPoint[], depth: number): KDNode | null {
    if (points.length === 0) return null;
    const axis = depth % this.dims;
    points.sort((a, b) => a.features[axis] - b.features[axis]);
    const mid = Math.floor(points.length / 2);
    return {
      point: points[mid],
      axis,
      left: this.build(points.slice(0, mid), depth + 1),
      right: this.build(points.slice(mid + 1), depth + 1),
    };
  }

  /** The k nearest points to `query`, ascending by squared distance. */
  nearestK(query: ArrayLike<number>, k: number): KDMatch[] {
    const best: KDMatch[] = [];
    if (!this.root || k <= 0) return best;

    const visit = (node: KDNode | null) => {
      if (!node) return;
      const d = squaredDistance(query, node.point.features);
      if (best.length < k) {
        insertSorted(best, { id: node.point.id, dist: d });
      } else if (d < best[best.length - 1].dist) {
        insertSorted(best, { id: node.point.id, dist: d });
        best.pop();
      }

      const axis = node.axis;
      const diff = query[axis] - node.point.features[axis];
      const nearSide = diff < 0 ? node.left : node.right;
      const farSide = diff < 0 ? node.right : node.left;
      visit(nearSide);
      if (best.length < k || diff * diff < best[best.length - 1].dist) {
        visit(farSide);
      }
    };

    visit(this.root);
    return best;
  }
}
