"""隣り合う市区町村どうしの「移動の手間」を標高から見積もり、data/boundaries/edges.json に書く。

直線距離では、尾根や峠を挟んだ町も近く見えてしまう。そこで標高タイルの上で、坂道ほど
手間がかかるとして町の代表点どうしを結ぶ最小コスト経路を求め、平地を時速40kmで走る
ときの分に換算する。経路は谷や低い峠を選ぶので、道路のおおまかな代わりになる。

標高: AWS Terrain Tiles（Terrarium 形式、ズーム9、1画素はおよそ250m）
    https://registry.opendata.aws/terrain-tiles/

使い方:
    python3 -m pip install numpy scipy scikit-image pillow shapely
    python3 scripts/terrain_edges.py [タイルの保存先]
"""

import json
import math
import sys
import urllib.request
from pathlib import Path

import numpy as np
from PIL import Image
from shapely import STRtree
from shapely.geometry import shape
from shapely.ops import unary_union
from skimage.graph import MCP_Geometric

ROOT = Path(__file__).resolve().parent.parent
Z = 9
TILE_URL = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"
SLOPE_PENALTY = 10.0  # 勾配 0.1 の坂は平地の2倍の手間
SEA_COST = 50.0  # 海は渡れないものとして扱う（橋やフェリーは考えない）
FLAT_KMH = 40.0
MARGIN_DEG = 0.03


def tile_xy(lng, lat):
    n = 2**Z
    x = (lng + 180) / 360 * n
    y = (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n
    return x, y


def lnglat(px, py):
    n = 2**Z * 256
    lng = px / n * 360 - 180
    lat = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * py / n))))
    return lng, lat


class Tiles:
    def __init__(self, cache: Path):
        self.cache = cache
        cache.mkdir(parents=True, exist_ok=True)
        self.mem = {}

    def get(self, x, y):
        if (x, y) in self.mem:
            return self.mem[(x, y)]
        path = self.cache / f"{Z}-{x}-{y}.png"
        if not path.exists():
            req = urllib.request.Request(TILE_URL.format(z=Z, x=x, y=y), headers={"User-Agent": "tabisaki"})
            path.write_bytes(urllib.request.urlopen(req, timeout=30).read())
        rgb = np.asarray(Image.open(path).convert("RGB"), dtype=np.float32)
        elev = rgb[..., 0] * 256 + rgb[..., 1] + rgb[..., 2] / 256 - 32768
        self.mem[(x, y)] = elev
        return elev

    def window(self, w, s, e, n):
        x0, y0 = tile_xy(w, n)
        x1, y1 = tile_xy(e, s)
        tx0, ty0, tx1, ty1 = int(x0), int(y0), int(x1), int(y1)
        rows = [np.hstack([self.get(tx, ty) for tx in range(tx0, tx1 + 1)]) for ty in range(ty0, ty1 + 1)]
        grid = np.vstack(rows)
        # 必要な範囲だけ切り出す（画素座標はタイル全体の左上が原点）
        px0, py0 = int((x0 - tx0) * 256), int((y0 - ty0) * 256)
        px1, py1 = int((x1 - tx0) * 256) + 1, int((y1 - ty0) * 256) + 1
        return grid[py0:py1, px0:px1], (tx0 * 256 + px0, ty0 * 256 + py0)


def cost_raster(elev, lat):
    # 1画素の実距離（m）。メルカトルなので緯度で縮む
    cell = 40075016.686 * math.cos(math.radians(lat)) / (2**Z * 256)
    gy, gx = np.gradient(elev, cell)
    slope = np.hypot(gx, gy)
    cost = (1 + SLOPE_PENALTY * np.minimum(slope, 1.0)) * cell
    cost[elev <= 0] = SEA_COST * cell
    return cost, cell


def main():
    cache = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / ".terrain-cache"
    tiles = Tiles(cache)
    detailed = json.loads((ROOT / "data/boundaries/detailed.json").read_text())

    polys = {}
    for f in detailed["features"]:
        # 所属未定地などコードのない区域は町として扱わない
        if f["geometry"] and f["properties"]["N03_007"]:
            polys.setdefault(f["properties"]["N03_007"], []).append(shape(f["geometry"]))
    ids = sorted(polys)
    geoms = [unary_union(polys[i]).buffer(0) for i in ids]
    points = [g.representative_point() for g in geoms]

    tree = STRtree(geoms)
    pairs = set()
    for i, g in enumerate(geoms):
        for j in tree.query(g, predicate="intersects"):
            if i < j:
                pairs.add((i, int(j)))
    print(f"{len(ids)} 町、隣接 {len(pairs)} 組", file=sys.stderr)

    edges = []
    for k, (i, j) in enumerate(sorted(pairs)):
        a, b = points[i], points[j]
        w = min(geoms[i].bounds[0], geoms[j].bounds[0]) - MARGIN_DEG
        s = min(geoms[i].bounds[1], geoms[j].bounds[1]) - MARGIN_DEG
        e = max(geoms[i].bounds[2], geoms[j].bounds[2]) + MARGIN_DEG
        n = max(geoms[i].bounds[3], geoms[j].bounds[3]) + MARGIN_DEG
        elev, (ox, oy) = tiles.window(w, s, e, n)
        cost, cell = cost_raster(elev, (s + n) / 2)

        def rc(p):
            x, y = tile_xy(p.x, p.y)
            r = min(max(int(y * 256) - oy, 0), cost.shape[0] - 1)
            c = min(max(int(x * 256) - ox, 0), cost.shape[1] - 1)
            return r, c

        ra, rb = rc(a), rc(b)
        mcp = MCP_Geometric(cost)
        acc, _ = mcp.find_costs([ra], [rb])
        meters = float(acc[rb])
        minutes = meters / 1000 / FLAT_KMH * 60
        edges.append([ids[i], ids[j], round(minutes, 1)])
        if k % 500 == 0:
            print(f"  {k}/{len(pairs)}", file=sys.stderr)

    out = ROOT / "data/boundaries/edges.json"
    out.write_text(json.dumps({"model": {"zoom": Z, "slopePenalty": SLOPE_PENALTY, "flatKmh": FLAT_KMH}, "edges": edges}))
    print(f"{out} に {len(edges)} 組を書きました", file=sys.stderr)


if __name__ == "__main__":
    main()
