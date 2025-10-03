// supabase/functions/campus_route/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type LatLng = [number, number];
type NodeId = string;
type Node = { id: NodeId; lat: number; lng: number; edges: { to: NodeId; w: number }[] };

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  // SERVICE_ROLE para leer tabla privada sin exponer la key al cliente
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { global: { fetch } }
);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
    },
  });

const keyOf = (lat: number, lng: number) => `${lat.toFixed(6)},${lng.toFixed(6)}`;
const toLatLng = (n: Node) => [n.lat, n.lng] as LatLng;

const haversine = (a: LatLng, b: LatLng) => {
  const toRad = (x: number) => (x * Math.PI) / 180;
  const [lat1, lng1] = a, [lat2, lng2] = b;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const s1 = Math.sin(dLat / 2) ** 2 +
             Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(s1), Math.sqrt(1 - s1));
};

const nearestNode = (G: Map<NodeId, Node>, p: LatLng) => {
  let best: Node | null = null, bestD = Infinity;
  for (const n of G.values()) {
    const d = haversine([n.lat, n.lng], p);
    if (d < bestD) { bestD = d; best = n; }
  }
  return { node: best, dist: bestD };
};

const astar = (G: Map<NodeId,Node>, start: NodeId, goal: NodeId): NodeId[] | null => {
  const h = (a:NodeId,b:NodeId) => {
    const A = G.get(a)!, B = G.get(b)!;
    return haversine([A.lat,A.lng],[B.lat,B.lng]);
  };
  const open = new Set<NodeId>([start]);
  const came = new Map<NodeId,NodeId>();
  const g = new Map<NodeId,number>([[start,0]]);
  const f = new Map<NodeId,number>([[start,h(start,goal)]]);
  const popBest = () => {
    let bid: NodeId | null = null, bf = Infinity;
    for (const id of open) { const fv = f.get(id) ?? Infinity; if (fv < bf) { bf=fv; bid=id; } }
    if (bid) open.delete(bid);
    return bid;
  };
  while (open.size) {
    const cur = popBest()!;
    if (cur === goal) {
      const path: NodeId[] = [cur];
      while (came.has(path[0])) path.unshift(came.get(path[0])!);
      return path;
    }
    const curG = g.get(cur) ?? Infinity;
    for (const e of G.get(cur)!.edges) {
      const ng = curG + e.w;
      if (ng < (g.get(e.to) ?? Infinity)) {
        came.set(e.to, cur);
        g.set(e.to, ng);
        f.set(e.to, ng + h(e.to, goal));
        open.add(e.to);
      }
    }
  }
  return null;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return json({}, 200);
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  try {
    const { from, to } = await req.json() as { from: LatLng; to: LatLng };
    if (!from || !to || !Array.isArray(from) || !Array.isArray(to)) {
      return json({ error: "Bad body" }, 400);
    }

    // 1) Cargar calles privadas
    const { data, error } = await supabase.from("footways").select("geom");
    if (error) throw error;
    if (!data?.length) return json({ path: null });

    // 2) Construir grafo
    const G = new Map<NodeId, Node>();
    for (const fw of data) {
      const coords: [number,number][] = fw.geom.coordinates; // [lng,lat]
      for (let i=0; i<coords.length-1; i++) {
        const [lng1,lat1] = coords[i];
        const [lng2,lat2] = coords[i+1];
        const id1 = keyOf(lat1,lng1), id2 = keyOf(lat2,lng2);
        const a = G.get(id1) || { id:id1, lat:lat1, lng:lng1, edges:[] };
        const b = G.get(id2) || { id:id2, lat:lat2, lng:lng2, edges:[] };
        const w = haversine([lat1,lng1],[lat2,lng2]);
        a.edges.push({ to:id2, w });
        b.edges.push({ to:id1, w });
        G.set(id1,a); G.set(id2,b);
      }
    }
    if (G.size === 0) return json({ path: null });

    // 3) Snap a nodos cercanos (umbral 60 m)
    const fromN = nearestNode(G, from);
    const toN   = nearestNode(G, to);
    if (!fromN.node || !toN.node || fromN.dist > 60 || toN.dist > 60) {
      return json({ path: null });
    }

    // 4) A*
    const nodePath = astar(G, fromN.node.id, toN.node.id);
    if (!nodePath) return json({ path: null });

    // 5) Polilínea resultante [ [lat,lng], ... ]
    const path: LatLng[] = nodePath.map(id => toLatLng(G.get(id)!));
    return json({ path });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
