// src/components/PublicNavigator.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet-routing-machine/dist/leaflet-routing-machine.css";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogPortal,
  DialogOverlay,
  DialogFooter,
} from "@/components/ui/dialog";
import { Search, PanelTopOpen, X, MapPin, LogIn, LogOut, UserCircle2 } from "lucide-react";

/* --- Leaflet icon fix --- */
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

/* --- util --- */
const norm = (s = "") =>
  s
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
const normAlnum = (s = "") => norm(s).replace(/[^\p{L}\p{N}]/gu, "");
const tokenize = (s = "") =>
  norm(s)
    .split(/\s+/)
    .map((t) => t.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter((t) => t.length >= 2 || /^\d+$/.test(t));
const strongTokensOf = (tokens: string[]) => tokens.filter((t) => t.length >= 3 || /^\d+$/.test(t));

const UNEMI_CENTER: [number, number] = [-2.14898719, -79.60420553];

/* --- types (flexible) --- */
type Building = any;
type Room = any;
type Floor = any;
type Landmark = any;
type Footway = any;
type Route = any;
type RouteStep = any;

/* --- Geo helpers --- */
const haversine = (a: L.LatLngExpression, b: L.LatLngExpression) => L.latLng(a).distanceTo(L.latLng(b));
const keyOf = (lat: number, lng: number) => `${lat.toFixed(6)},${lng.toFixed(6)}`;

/* --- projection helpers --- */
function projectPointToSegment(P: L.LatLng, A: L.LatLng, B: L.LatLng) {
  const ax = A.lng, ay = A.lat;
  const bx = B.lng, by = B.lat;
  const px = P.lng, py = P.lat;
  const ABx = bx - ax, ABy = by - ay;
  const APx = px - ax, APy = py - ay;
  const ab2 = ABx * ABx + ABy * ABy;
  const t = ab2 === 0 ? 0 : Math.max(0, Math.min(1, (APx * ABx + APy * ABy) / ab2));
  const qx = ax + ABx * t;
  const qy = ay + ABy * t;
  const Q = L.latLng(qy, qx);
  const dist = Q.distanceTo(P);
  return { Q, t, dist };
}

/* --- nearestProjection, integrateProjection, astar etc. --- */
type NodeId = string;
type Node = { id: NodeId; lat: number; lng: number; edges: { to: NodeId; w: number }[] };
type Segment = { a: L.LatLng; b: L.LatLng; aId: NodeId; bId: NodeId };
const nearestProjection = (p: L.LatLng, segments: Segment[]) => {
  let best = { Q: p, dist: Infinity, t: 0, segIndex: -1 };
  for (let i = 0; i < segments.length; i++) {
    const proj = projectPointToSegment(p, segments[i].a, segments[i].b);
    if (proj.dist < best.dist) best = { Q: proj.Q, dist: proj.dist, t: proj.t, segIndex: i };
  }
  return best;
};
function cloneGraph(G: Map<NodeId, Node>) {
  const G2 = new Map<NodeId, Node>();
  for (const [id, n] of G.entries()) G2.set(id, { id, lat: n.lat, lng: n.lng, edges: n.edges.map((e) => ({ ...e })) });
  return G2;
}
function integrateProjection(G: Map<NodeId, Node>, segments: Segment[], proj: { Q: L.LatLng; segIndex: number }) {
  const seg = segments[proj.segIndex];
  const Qid = keyOf(proj.Q.lat, proj.Q.lng);
  if (!G.has(Qid)) G.set(Qid, { id: Qid, lat: proj.Q.lat, lng: proj.Q.lng, edges: [] });
  const add = (from: NodeId, to: NodeId, w: number) => {
    const n = G.get(from)!;
    if (!n.edges.some((e) => e.to === to)) n.edges.push({ to, w });
  };
  const dQA = proj.Q.distanceTo(seg.a);
  const dQB = proj.Q.distanceTo(seg.b);
  add(Qid, seg.aId, dQA);
  add(seg.aId, Qid, dQA);
  add(Qid, seg.bId, dQB);
  add(seg.bId, Qid, dQB);
  return Qid;
}
function turnDirection(prev: L.LatLng, cur: L.LatLng, next: L.LatLng) {
  const v1x = cur.lng - prev.lng, v1y = cur.lat - prev.lat;
  const v2x = next.lng - cur.lng, v2y = next.lat - cur.lat;
  const cross = v1x * v2y - v1y * v2x;
  const dot = v1x * v2x + v1y * v2y;
  const mag1 = Math.hypot(v1x, v1y), mag2 = Math.hypot(v2x, v2y);
  const cos = dot / (mag1 * mag2 || 1);
  const angle = Math.acos(Math.max(-1, Math.min(1, cos)));
  if (angle < (15 * Math.PI) / 180) return null;
  return cross > 0 ? "izquierda" : "derecha";
}
function buildTurnByTurn(path: L.LatLng[], destino?: L.LatLng): string[] {
  if (path.length < 2) return [];
  const steps: string[] = [];
  let distAcc = 0;
  for (let i = 1; i < path.length; i++) {
    const d = path[i - 1].distanceTo(path[i]);
    if (i < path.length - 1) {
      const dir = turnDirection(path[i - 1], path[i], path[i + 1]);
      distAcc += d;
      if (dir) {
        steps.push(`En ${Math.round(distAcc)} m, gira a la ${dir}.`);
        distAcc = 0;
      }
    } else {
      distAcc += d;
    }
  }
  if (distAcc > 0) steps.push(`Continúa ${Math.round(distAcc)} m hasta la entrada.`);
  if (destino && path.length >= 2) {
    const a = path[path.length - 2], b = path[path.length - 1];
    const seg = L.latLng(b.lat - a.lat, b.lng - a.lng);
    const toDest = L.latLng(destino.lat - b.lat, destino.lng - b.lng);
    const cross = seg.lng * toDest.lat - seg.lat * toDest.lng;
    const lado = cross > 0 ? "izquierda" : "derecha";
    steps.push(`El destino quedará a tu ${lado}.`);
  }
  return steps;
}

/* ---------------- resolvePublicImageUrl ----------------
   Resuelve URLs públicas y paths de buckets building_maps y room_maps/rooms
*/
const resolvePublicImageUrl = async (raw: string | null | undefined): Promise<string | null> => {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;

  const candidate = trimmed.replace(/^\/+/, "");

  const tryGet = async (bucket: string, path: string) => {
    try {
      // supabase-js v2: storage.from(bucket).getPublicUrl(path)
      // @ts-ignore
      const from = (supabase as any).storage.from(bucket);
      if (!from) return null;
      const maybe = await from.getPublicUrl(path);
      if (maybe?.data?.publicUrl) return maybe.data.publicUrl as string;
      if (maybe?.publicURL) return maybe.publicURL;
      if (maybe?.publicUrl) return maybe.publicUrl;
    } catch (e) {
      // ignore
    }
    return null;
  };

  const attempts = [
    ["building_maps", candidate],
    ["building_maps", `/${candidate}`],
    ["room_maps/rooms", candidate],
    ["room_maps", candidate],
    ["room_maps", `rooms/${candidate}`],
    ["room_maps/rooms", `rooms/${candidate}`],
  ];

  for (const [bucket, path] of attempts) {
    const r = await tryGet(bucket, path);
    if (r) return r;
  }

  return candidate || null;
};

/* ---------------- COMPONENT ---------------- */
export default function PublicNavigator() {
  /* --- estados básicos --- */
  const [query, setQuery] = useState("");
  const [userLoc, setUserLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsDenied, setGpsDenied] = useState(false);

  const [appUser, setAppUser] = useState<any>(null);

  // datos campus
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [selectedBuilding, setSelectedBuilding] = useState<Building | null>(null);
  const [buildingFloors, setBuildingFloors] = useState<Floor[]>([]);
  const [buildingRooms, setBuildingRooms] = useState<Room[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);

  const [footways, setFootways] = useState<Footway[]>([]);
  const [entrances, setEntrances] = useState<any[]>([]);
  const [landmarks, setLandmarks] = useState<any[]>([]);

  // mapa y refs
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.Marker[]>([]);
  const routingRef = useRef<any>(null);
  const routeLayerRef = useRef<L.Layer | null>(null);
  const buildingNoteRef = useRef<L.Tooltip | null>(null);

  // UI rutas/instrucciones
  const [steps, setSteps] = useState<string[]>([]);
  const [ttsPlaying, setTtsPlaying] = useState(false);
  const [routeActive, setRouteActive] = useState(false);
  const [stepsOpen, setStepsOpen] = useState(false);

  // contexto del paso actual (estos contendrán image_url ya resueltas)
  const [currentStepBuilding, setCurrentStepBuilding] = useState<Building | null>(null);
  const [currentStepRoom, setCurrentStepRoom] = useState<Room | null>(null);

  // para mostrar imagen del primer edificio del recorrido (top-right)
  const [firstRouteBuildingImage, setFirstRouteBuildingImage] = useState<string | null>(null);

  // resultados de búsqueda (modal)
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [resultsOpen, setResultsOpen] = useState(false);

  // graph refs (para routing peatonal)
  const graphRef = useRef<Map<NodeId, Node> | null>(null);
  const segmentsRef = useRef<Segment[] | null>(null);
  const triggerPtsRef = useRef<L.LatLng[]>([]);
  const routePathRef = useRef<L.LatLng[] | null>(null);

  // helpers para voice
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  // categorías que deben usar "más cercano"
  const CATEGORY_NEAREST = [
    "baño","baños","wc","servicio","servicios",
    "punto de encuentro","puntos de encuentro","encuentro",
    "tienda","tiendas","shop","shops",
    "bar","bares","restaurante","restaurantes",
    "parqueadero","parqueaderos","estacionamiento","estacionamientos","parking"
  ].map((s) => norm(s));

  /* ------------- init: geolocation + cargar datos -------------- */
  useEffect(() => {
    if ("geolocation" in navigator) {
      navigator.geolocation.watchPosition(
        (pos) => setUserLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => { setGpsDenied(true); toast.message("No se pudo obtener tu ubicación."); },
        { enableHighAccuracy: true, maximumAge: 5000 }
      );
    } else setGpsDenied(true);

    (async () => {
      const { data, error } = await (supabase as any)
        .from("buildings")
        .select("id,name,description,latitude,longitude,total_floors,building_code,state,image_url,map_image_path")
        .eq("state", "HABILITADO")
        .order("name", { ascending: true });
      if (error) console.error(error);
      else setBuildings(data || []);
    })();

    (async () => {
      const { data, error } = await (supabase as any)
        .from("footways")
        .select("id,state,geom")
        .eq("state", "ABIERTO");
      if (!error) setFootways((data || []).map((fw: any) => ({ ...fw, geom: typeof fw.geom === "string" ? JSON.parse(fw.geom) : fw.geom })));
    })();

    (async () => {
      const { data, error } = await (supabase as any).from("entrances").select("id,building_id,name,type,location");
      if (!error) setEntrances(data || []);
    })();

    (async () => {
      const { data, error } = await (supabase as any).from("landmarks").select("id,name,type,location,building_id").limit(1000);
      if (!error) setLandmarks(data || []);
    })();

    // load persisted user if existe
    try {
      const raw = localStorage.getItem("appUser");
      if (raw) setAppUser(JSON.parse(raw));
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ------------- mapa init -------------- */
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;
    const map = L.map(mapContainer.current, { zoomControl: true, attributionControl: true }).setView(UNEMI_CENTER, 17);
    mapRef.current = map;
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap contributors", maxZoom: 19 }).addTo(map);
    addBuildingMarkers();
    return () => {
      try {
        markersRef.current.forEach((m) => map.removeLayer(m));
        if (routeLayerRef.current) map.removeLayer(routeLayerRef.current);
        map.remove();
        mapRef.current = null;
      } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { addBuildingMarkers(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [buildings]);

  const addBuildingMarkers = () => {
    if (!mapRef.current) return;
    markersRef.current.forEach((m) => mapRef.current?.removeLayer(m));
    markersRef.current = [];

    buildings.forEach((b: any) => {
      const marker = L.marker([b.latitude, b.longitude], { title: b.name }).addTo(mapRef.current!);
      marker.on("click", () => handleSelectBuilding(b, true));
      markersRef.current.push(marker);
    });
  };

  /* ------------- búsqueda y resultados -------------- */
  const findBuilding = (termRaw: string) => {
    let t = norm(termRaw).replace(/^bloque\s+/, "");
    const tokens = tokenize(t);
    const strong = strongTokensOf(tokens);
    if (strong.length === 0) return [];
    const strict = buildings.filter((b: any) => {
      const label = `${b.name} ${b.building_code ?? ""}`;
      return strong.every((t) => normAlnum(label).includes(t));
    });
    if (strict.length > 0) return strict;
    return buildings.filter((b: any) => {
      const label = `${b.name} ${b.building_code ?? ""}`;
      return strong.some((t) => normAlnum(label).includes(t));
    });
  };

  const findRooms = async (termRaw: string): Promise<Room[]> => {
    const raw = termRaw.trim();
    const tokens = tokenize(raw);
    const strong = strongTokensOf(tokens);
    const kwArray = `{${(strong.length > 0 ? strong : tokens).join(",")}}`;
    const orParts: string[] = [`name.ilike.%${raw}%`, `room_number.ilike.%${raw}%`];
    (strong.length > 0 ? strong : tokens).forEach((tok) => {
      orParts.push(`name.ilike.%${tok}%`);
      orParts.push(`room_number.ilike.%${tok}%`);
    });
    if ((strong.length > 0 ? strong : tokens).length > 0) {
      orParts.push(`keywords.ov.${kwArray}`);
      orParts.push(`actividades.ov.${kwArray}`);
    }
    const allowed = ["public", "student", "admin"].slice(0, 1 + (appUser?.role === "student" ? 1 : 0) + (appUser?.role === "admin" ? 1 : 0));
    const { data, error } = await (supabase as any)
      .from("rooms")
      .select("id,floor_id,name,room_number,description,directions,room_type_id,capacity,equipment,keywords,actividades,target,image_url,map_image_path")
      .in("target", allowed)
      .or(orParts.join(","))
      .limit(200);
    if (error) {
      console.error(error);
      toast.error("Error buscando espacios");
      return [];
    }
    const rooms0 = (data || []) as Room[];
    const typeIds = Array.from(new Set(rooms0.map((r) => r.room_type_id).filter(Boolean)));
    let typeMap = new Map<string, string>();
    if (typeIds.length) {
      const { data: types } = await (supabase as any).from("room_types").select("id,name").in("id", typeIds);
      (types || []).forEach((t: any) => typeMap.set(t.id, t.name));
    }
    // Enrich floors/building
    const enriched: Room[] = await Promise.all(
      rooms0.map(async (r) => {
        try {
          const { data: floor } = await (supabase as any).from("floors").select("id,floor_number,building_id").eq("id", r.floor_id).single();
          let building_name = null, building_lat = null, building_lng = null;
          if (floor?.building_id) {
            const { data: b } = await (supabase as any).from("buildings").select("id,name,latitude,longitude").eq("id", floor.building_id).single();
            if (b) { building_name = b.name; building_lat = b.latitude; building_lng = b.longitude; }
          }
          return { ...r, floor: floor ? { id: floor.id, floor_number: floor.floor_number, building_id: floor.building_id } : r.floor, room_type_name: typeMap.get(r.room_type_id) ?? null, building_name, building_latitude: building_lat, building_longitude: building_lng } as Room;
        } catch (err) {
          return { ...r, room_type_name: typeMap.get(r.room_type_id) ?? null } as Room;
        }
      })
    );
    return enriched;
  };

  const findLandmarksMany = async (termRaw: string): Promise<Landmark[]> => {
    const tokens = tokenize(termRaw);
    const strong = strongTokensOf(tokens);
    const { data, error } = await (supabase as any).from("landmarks").select("id,name,type,location,building_id").limit(200);
    if (error) return [];
    const list = (data || []) as Landmark[];
    return list.filter((lm) => {
      const label = `${lm.name ?? ""} ${lm.type}`;
      return strong.length > 0 ? strong.every((t) => normAlnum(label).includes(t)) : tokens.some((t) => normAlnum(label).includes(t));
    });
  };

  /* ---------------- distance from user ---------------- */
  const distanceFromUser = (u: { lat: number; lng: number } | null, item: any) => {
    if (!u) return Infinity;
    try {
      if (item.kind === "room" && item.room) {
        const r = item.room as Room;
        if (r.building_latitude != null && r.building_longitude != null) return haversine([u.lat, u.lng], [r.building_latitude, r.building_longitude]);
      }
      if (item.kind === "landmark" && item.landmark) {
        const coords = item.landmark.location?.coordinates;
        if (coords && coords.length >= 2) { const [lng, lat] = coords; return haversine([u.lat, u.lng], [lat, lng]); }
      }
      if (item.kind === "building" && item.building) {
        const b = item.building as Building;
        if (b.latitude != null && b.longitude != null) return haversine([u.lat, u.lng], [b.latitude, b.longitude]);
      }
    } catch {}
    return Infinity;
  };

  /* ---------------- handleSearch ---------------- */
  const fetchRouteByName = async (term: string): Promise<Route | null> => {
    const { data, error } = await (supabase as any).from("routes").select("id,name,description,is_active").ilike("name", `%${term}%`).eq("is_active", true).limit(1);
    if (error) { console.error(error); return null; }
    return data?.[0] ?? null;
  };

  const startRouteByName = async (term: string) => {
    const r = await fetchRouteByName(term);
    if (!r) { toast.message("No encontré un recorrido con ese nombre."); return; }
    const steps = await fetchRouteSteps(r.id);
    if (!steps.length) { toast.message("Este recorrido no tiene pasos."); return; }

    // intento obtener imagen del primer paso y resolverla
    try {
      const firstMeta = await latlngAndMetaOfStep(steps[0]);
      let img: string | null = null;
      if (firstMeta.building?.image_url) img = firstMeta.building.image_url;
      else if (firstMeta.room?.image_url) img = firstMeta.room.image_url;
      if (img && !/^https?:\/\//i.test(img)) {
        const resolved = await resolvePublicImageUrl(img);
        if (resolved) img = resolved;
      }
      setFirstRouteBuildingImage(img ?? null);
    } catch (e) {
      setFirstRouteBuildingImage(null);
    }

    // inicio
    setRouteActive(true);
    setStepsOpen(false);
    await playCurrentRouteStepIndex(0, r, steps);
  };

  const handleSearch = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const q = (query || "").trim();
    if (!q) return;
    const rList = await findRooms(q);
    const lList = await findLandmarksMany(q);
    const bList = findBuilding(q);

    const enrichedRooms = (rList || []).map((r) => ({ kind: "room", room: r, label: r.name }));
    const enrichedLandmarks = (lList || []).map((l) => ({ kind: "landmark", landmark: l, label: l.name ?? l.type }));
    const enrichedBuildings = (bList || []).map((b) => ({ kind: "building", building: b, label: b.name }));

    let hits = [...enrichedRooms, ...enrichedLandmarks, ...enrichedBuildings];

    if (hits.length === 0) {
      const asRoute = await fetchRouteByName(q);
      if (asRoute) { await startRouteByName(q); return; }
      toast.error("Sin resultados");
      return;
    }

    const normalizedQuery = norm(q);
    const isCategoryQuery = CATEGORY_NEAREST.some((c) => normalizedQuery.includes(c) || q.toLowerCase().includes(c));

    if (isCategoryQuery && userLoc) {
      const scored = hits.map((h) => ({ item: h, d: distanceFromUser(userLoc, h) })).sort((a, b) => a.d - b.d);
      const best = scored[0];
      if (best && best.d < Infinity) {
        const h = best.item;
        if (h.kind === "room" && h.room) { setSearchResults([]); setResultsOpen(false); await focusRoom(h.room); return; }
        if (h.kind === "landmark" && h.landmark) { setSearchResults([]); setResultsOpen(false); await focusLandmark(h.landmark); return; }
        if (h.kind === "building" && h.building) { setSearchResults([]); setResultsOpen(false); await handleSelectBuilding(h.building, true); return; }
      }
    }

    if (hits.length === 1) {
      const h = hits[0];
      if (h.kind === "room" && h.room) await focusRoom(h.room);
      else if (h.kind === "landmark" && h.landmark) await focusLandmark(h.landmark);
      else if (h.kind === "building" && h.building) await handleSelectBuilding(h.building, true);
      return;
    }

    // multiple results => show modal (NO images here)
    setSearchResults(hits);
    setResultsOpen(true);
  };

  /* ---------------- focus helpers ---------------- */
  const handleSelectBuilding = async (b: Building, fit = false) => {
    setSelectedBuilding(b);
    setSelectedRoom(null);
    if (mapRef.current && fit) {
      mapRef.current.setView([b.latitude, b.longitude], 18, { animate: true });
      L.popup().setLatLng([b.latitude, b.longitude]).setContent(`<b>${b.name}</b>`).openOn(mapRef.current);
    }
    await loadFloorsAndRooms(b.id);
  };

  const loadFloorsAndRooms = async (buildingId: string) => {
    try {
      const { data: floors, error: floorsErr } = await (supabase as any).from("floors").select("id,building_id,floor_number,floor_name").eq("building_id", buildingId).order("floor_number", { ascending: true });
      if (floorsErr) throw floorsErr;
      setBuildingFloors((floors || []) as Floor[]);
      const floorIds = (floors || []).map((f: any) => f.id);
      if (!floorIds.length) { setBuildingRooms([]); return; }

      const allowed = ["public", "student", "admin"].slice(0, 1 + (appUser?.role === "student" ? 1 : 0) + (appUser?.role === "admin" ? 1 : 0));
      const { data: rooms, error: roomsErr } = await (supabase as any).from("rooms").select("id,floor_id,name,room_number,description,directions,room_type_id,capacity,equipment,keywords,actividades,target,image_url,map_image_path").in("floor_id", floorIds).in("target", allowed).order("name", { ascending: true });
      if (roomsErr) throw roomsErr;

      const fMap = new Map<string, Floor>(); (floors || []).forEach((f: any) => fMap.set(f.id, f));
      const typeIds = Array.from(new Set(((rooms || []) as any).map((r: any) => r.room_type_id).filter(Boolean)));
      let typeMap = new Map<string, string>();
      if (typeIds.length) {
        const { data: types } = await (supabase as any).from("room_types").select("id,name").in("id", typeIds);
        (types || []).forEach((t: any) => typeMap.set(t.id, t.name));
      }

      const enhanced = await Promise.all((rooms || []).map(async (r: any) => {
        const roomObj: Room = { ...r, floor: fMap.get(r.floor_id) ? { id: r.floor_id, floor_number: fMap.get(r.floor_id)!.floor_number } : undefined, room_type_name: typeMap.get(r.room_type_id) ?? null };
        // resolve room.image_url if needed (make it public)
        const resolvedRoomImg = await resolvePublicImageUrl(roomObj.image_url || roomObj.map_image_path || null);
        if (resolvedRoomImg) roomObj.image_url = resolvedRoomImg;
        return roomObj;
      }));
      setBuildingRooms(enhanced);
    } catch (e) {
      console.error(e);
      toast.error("Error cargando pisos/rooms");
    }
  };

  const focusLandmark = async (lm: Landmark) => {
    if (!mapRef.current) return;
    const [lng, lat] = lm.location.coordinates;
    const ll = L.latLng(lat, lng);
    if (!userLoc) {
      clearRouteLayers();
      toast.error("Activa el GPS para trazar la ruta a la referencia.");
      mapRef.current.setView(ll, 18, { animate: true });
      L.popup().setLatLng(ll).setContent(`<b>${lm.name ?? lm.type}</b>`).openOn(mapRef.current);
      return;
    }
    await drawFootRoute(L.latLng(userLoc.lat, userLoc.lng), ll);
    mapRef.current.setView(ll, 18, { animate: true });
    L.popup().setLatLng(ll).setContent(`<b>${lm.name ?? lm.type}</b>`).openOn(mapRef.current);
  };

  /* ---------------- focusRoom: resuelve imágenes antes de setear el estado ---------------- */
  const focusRoom = async (room: Room) => {
    try {
      const { data: floor, error: fErr } = await (supabase as any).from("floors").select("id,building_id,floor_number").eq("id", room.floor_id).single();
      if (fErr) throw fErr;
      const { data: building, error: bErr } = await (supabase as any).from("buildings").select("id,name,description,latitude,longitude,total_floors,building_code,state,image_url,map_image_path").eq("id", floor.building_id).eq("state", "HABILITADO").single();
      if (bErr || !building) {
        toast.error("El edificio no está habilitado.");
        return;
      }

      // cargar floors/rooms del building
      await handleSelectBuilding(building as Building, true);

      const roomWithFloor: Room = { ...room, floor: { id: floor.id, floor_number: (floor as any).floor_number } };
      setSelectedRoom(roomWithFloor);

      if (!userLoc) { toast.error("Activa el GPS para trazar la ruta."); return; }

      // resuelve imágenes públicas antes de mostrar modal de instrucciones
      const resolvedBuildingImg = await resolvePublicImageUrl(building.image_url || building.map_image_path || null);
      const resolvedRoomImg = await resolvePublicImageUrl(roomWithFloor.image_url || roomWithFloor.map_image_path || null);

      // setea currentStepBuilding/currentStepRoom con image_url resueltas
      const buildingWithResolved = { ...(building || {}), image_url: resolvedBuildingImg || (building?.image_url || null) };
      const roomWithResolved = { ...(roomWithFloor || {}), image_url: resolvedRoomImg || (roomWithFloor?.image_url || null) };

      setCurrentStepBuilding(buildingWithResolved);
      setCurrentStepRoom(roomWithResolved);

      // ahora traza la ruta desde user a la mejor entrada
      const from = L.latLng(userLoc.lat, userLoc.lng);
      const to = bestEntranceForBuilding((building as Building).id, from);
      await drawFootRoute(from, to, roomWithResolved);
    } catch (e) {
      console.error(e);
      toast.error("No se pudo focalizar el espacio");
    }
  };

  /* ---------------- graph builders / routing helpers ---------------- */
  const buildGraphAndSegments = (foot: Footway[]) => {
    const G = new Map<NodeId, Node>();
    const segs: Segment[] = [];
    for (const fw of foot) {
      const geom = typeof fw.geom === "string" ? JSON.parse(fw.geom) : fw.geom;
      const coords = geom?.coordinates as [number, number][];
      if (!coords?.length) continue;
      for (let i = 0; i < coords.length - 1; i++) {
        const [lng1, lat1] = coords[i];
        const [lng2, lat2] = coords[i + 1];
        const id1 = keyOf(lat1, lng1);
        const id2 = keyOf(lat2, lng2);
        const a = G.get(id1) || { id: id1, lat: lat1, lng: lng1, edges: [] };
        const b = G.get(id2) || { id: id2, lat: lat2, lng: lng2, edges: [] };
        const w = L.latLng(lat1, lng1).distanceTo([lat2, lng2]);
        a.edges.push({ to: id2, w });
        b.edges.push({ to: id1, w });
        G.set(id1, a);
        G.set(id2, b);
        segs.push({ a: L.latLng(lat1, lng1), b: L.latLng(lat2, lng2), aId: id1, bId: id2 });
      }
    }
    return { G, segs };
  };

  const ensureGraphWithSegments = () => {
    if (!graphRef.current || !segmentsRef.current) {
      const { G, segs } = buildGraphAndSegments(footways);
      graphRef.current = G;
      segmentsRef.current = segs;
    }
    return { G: graphRef.current!, segments: segmentsRef.current! };
  };

  const astar = (G: Map<NodeId, Node>, start: NodeId, goal: NodeId): NodeId[] | null => {
    const h = (a: NodeId, b: NodeId) => {
      const A = G.get(a)!, B = G.get(b)!;
      return L.latLng(A.lat, A.lng).distanceTo([B.lat, B.lng]);
    };
    const open = new Set<NodeId>([start]);
    const came = new Map<NodeId, NodeId>();
    const g = new Map<NodeId, number>([[start, 0]]);
    const f = new Map<NodeId, number>([[start, h(start, goal)]]);
    const pop = () => {
      let best: NodeId | null = null, bestF = Infinity;
      for (const id of open) {
        const curF = f.get(id) ?? Infinity;
        if (curF < bestF) { bestF = curF; best = id; }
      }
      if (best) open.delete(best);
      return best;
    };
    while (open.size) {
      const cur = pop()!;
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

  const routeOnCampus = (fromLL: L.LatLng, toLL: L.LatLng): L.LatLng[] | null => {
    if (!footways.length) return null;
    const { G: baseG, segments } = ensureGraphWithSegments();
    if (!baseG || baseG.size === 0 || segments.length === 0) return null;
    const SNAP_MAX = 500;
    const projFrom = nearestProjection(fromLL, segments);
    const projTo = nearestProjection(toLL, segments);
    if (projFrom.dist > SNAP_MAX || projTo.dist > SNAP_MAX) return null;
    const G = cloneGraph(baseG);
    const fromId = integrateProjection(G, segments, projFrom);
    const toId = integrateProjection(G, segments, projTo);
    const ids = astar(G, fromId, toId);
    if (!ids) return null;
    return ids.map((id) => {
      const n = G.get(id)!;
      return L.latLng(n.lat, n.lng);
    });
  };

  const waitForGraphReady = async (maxMs = 4000, stepMs = 120) => {
    const t0 = Date.now();
    while (Date.now() - t0 < maxMs) {
      try {
        const { G, segments } = ensureGraphWithSegments();
        if (G && G.size > 0 && segments && segments.length > 0) return true;
      } catch {}
      await new Promise((r) => setTimeout(r, stepMs));
    }
    return false;
  };

  const bestEntranceForBuilding = (buildingId: string, fromLL: L.LatLng) => {
    const list = entrances.filter((e) => e.building_id === buildingId);
    if (!list.length) {
      const b = buildings.find((x: any) => x.id === buildingId)!;
      return L.latLng(b.latitude, b.longitude);
    }
    let best = list[0];
    let bestD = Infinity;
    list.forEach((e) => {
      const [lng, lat] = e.location.coordinates;
      const d = fromLL.distanceTo([lat, lng]);
      if (d < bestD) { bestD = d; best = e; }
    });
    const [lng, lat] = best.location.coordinates;
    return L.latLng(lat, lng);
  };

  /* ---------------- TTS ---------------- */
  const speakAll = (texts: string[], lang = "es-ES") => {
    if (!("speechSynthesis" in window)) { toast("Tu navegador no soporta voz."); return; }
    try { window.speechSynthesis.cancel(); } catch {}
    if (!texts || texts.length === 0) return;
    const txt = texts.join(". ");
    const u = new SpeechSynthesisUtterance(txt);
    u.lang = lang; u.rate = 1;
    u.onend = () => setTtsPlaying(false);
    u.onerror = (ev: any) => {
      console.warn("TTS error", ev);
      setTtsPlaying(false);
      try { window.speechSynthesis.cancel(); } catch {}
    };
    utteranceRef.current = u;
    try { window.speechSynthesis.speak(u); setTtsPlaying(true); } catch (e) { console.warn("TTS failed", e); setTtsPlaying(false); }
  };
  const speakPause = () => {
    if (!("speechSynthesis" in window)) return;
    if (window.speechSynthesis.speaking && !window.speechSynthesis.paused) { window.speechSynthesis.pause(); setTtsPlaying(false); }
    else if (window.speechSynthesis.paused) { window.speechSynthesis.resume(); setTtsPlaying(true); }
  };
  const speakReset = () => { if (!("speechSynthesis" in window)) return; try { window.speechSynthesis.cancel(); } catch {} setTtsPlaying(false); utteranceRef.current = null; };

  /* ---------------- drawFootRoute ---------------- */
  const computeTurnPoints = (path: L.LatLng[]) => {
    const pts: L.LatLng[] = [];
    if (path.length < 2) return pts;
    for (let i = 1; i < path.length - 1; i++) {
      const dir = turnDirection(path[i - 1], path[i], path[i + 1]);
      if (dir) pts.push(path[i]);
    }
    pts.push(path[path.length - 1]);
    return pts;
  };

  const drawFallbackLine = (from: L.LatLng, to: L.LatLng) => {
    if (!mapRef.current) return;
    if (routeLayerRef.current) try { mapRef.current.removeLayer(routeLayerRef.current); } catch {}
    routeLayerRef.current = L.polyline([from, to], { weight: 5, dashArray: "6 8", opacity: 0.9 }).addTo(mapRef.current);
    mapRef.current.fitBounds((routeLayerRef.current as any).getBounds(), { padding: [60, 60], maxZoom: 19 });
  };

  const drawFootRoute = async (fromLL: L.LatLng, toLL: L.LatLng, roomInfo?: Room) => {
    if (!mapRef.current) return;
    if (routingRef.current && mapRef.current) try { mapRef.current.removeControl(routingRef.current); } catch {}
    if (routeLayerRef.current && mapRef.current) try { mapRef.current.removeLayer(routeLayerRef.current); } catch {}
    const ready = await waitForGraphReady();
    setRouteActive(true);
    setStepsOpen(false);

    try {
      await import("leaflet-routing-machine");

      if (ready) {
        const campusPath = routeOnCampus(fromLL, toLL);
        if (campusPath && campusPath.length >= 2) {
          const layer = L.polyline(campusPath, { weight: 5, opacity: 0.95 });
          routeLayerRef.current = layer.addTo(mapRef.current!);
          mapRef.current!.fitBounds(layer.getBounds(), { padding: [60, 60], maxZoom: 19 });

          const insts = buildTurnByTurn(campusPath, toLL);
          const out = (() => {
            const base = [...insts];
            if (roomInfo?.floor?.floor_number != null) base.push(`El destino está en el piso ${roomInfo.floor.floor_number}.`);
            const d = (roomInfo?.directions || "").trim();
            if (d) base.push(`Indicaciones adicionales: ${d}`);
            return base;
          })();
          setSteps(out);

          routePathRef.current = campusPath;
          triggerPtsRef.current = computeTurnPoints(campusPath);
          speakReset();
          setStepsOpen(true);
          speakAll(out);
          return;
        }
      }

      // fallback OSRM
      const plan = (L as any).Routing.plan([fromLL, toLL], {
        draggableWaypoints: false,
        addWaypoints: false,
        createMarker: (i: number, wp: any) => L.marker(wp.latLng, { title: i === 0 ? "Origen (a pie)" : "Destino" }),
      });

      const ctrl = (L as any).Routing.control({
        plan,
        router: (L as any).Routing.osrmv1({ serviceUrl: "https://router.project-osrm.org/route/v1", profile: "foot", timeout: 12000, steps: true, annotations: true }),
        fitSelectedRoutes: true,
        routeWhileDragging: false,
        showAlternatives: false,
        show: false,
      }).addTo(mapRef.current!);
      routingRef.current = ctrl;

      ctrl.on("routesfound", (e: any) => {
        const route = e.routes?.[0];
        const coords: L.LatLng[] = (route?.coordinates || []).map((c: any) => L.latLng(c.lat, c.lng));
        const insts = buildTurnByTurn(coords, toLL);
        const out = (() => {
          const base = [...insts];
          if (roomInfo?.floor?.floor_number != null) base.push(`El destino está en el piso ${roomInfo.floor.floor_number}.`);
          const d = (roomInfo?.directions || "").trim();
          if (d) base.push(`Indicaciones adicionales: ${d}`);
          return base;
        })();
        setSteps(out);
        routePathRef.current = coords;
        triggerPtsRef.current = computeTurnPoints(coords);
        setStepsOpen(true);
        speakAll(out);
      });

      ctrl.on("routingerror", () => {
        toast.message("No se pudo obtener ruta peatonal, dibujo una guía directa.");
        drawFallbackLine(fromLL, toLL);
        let insts = [`Camina en línea recta hacia el destino (≈ ${Math.round(haversine(fromLL, toLL))} m).`];
        if (roomInfo?.floor?.floor_number != null) insts.push(`El destino está en el piso ${roomInfo.floor.floor_number}.`);
        const d = (roomInfo?.directions || "").trim();
        if (d) insts.push(`Indicaciones adicionales: ${d}`);
        setSteps(insts);
        routePathRef.current = [fromLL, toLL];
        triggerPtsRef.current = [toLL];
        setStepsOpen(true);
        speakAll(insts);
      });
    } catch (e) {
      console.error(e);
      toast.error("No se pudo trazar la ruta. Te muestro una guía directa.");
      drawFallbackLine(fromLL, toLL);
      let insts = [`Camina en línea recta hacia el destino (≈ ${Math.round(haversine(fromLL, toLL))} m).`];
      if (roomInfo?.floor?.floor_number != null) insts.push(`El destino está en el piso ${roomInfo.floor.floor_number}.`);
      const d = (roomInfo?.directions || "").trim();
      if (d) insts.push(`Indicaciones adicionales: ${d}`);
      setSteps(insts);
      routePathRef.current = [fromLL, toLL];
      triggerPtsRef.current = [toLL];
      setStepsOpen(true);
      speakAll(insts);
    }
  };

  /* ----------------- proximity announcer ----------------- */
  useEffect(() => {
    if (!routeActive || !userLoc || !triggerPtsRef.current.length) return;
    const NEAR_M = 18;
    const check = () => {
      try {
        const nowPos = L.latLng(userLoc.lat, userLoc.lng);
        for (let i = 0; i < triggerPtsRef.current.length; i++) {
          const target = triggerPtsRef.current[i];
          const d = nowPos.distanceTo(target);
          if (d <= NEAR_M) {
            const idx = Math.min(i, steps.length - 1);
            if (idx >= 0) speakAll([steps[idx]]);
            break;
          }
        }
      } catch (e) {}
    };
    const id = setInterval(check, 2000);
    return () => clearInterval(id);
  }, [routeActive, userLoc, steps]);

  const clearRouteLayers = () => {
    if (!mapRef.current) return;
    if (routingRef.current) try { mapRef.current.removeControl(routingRef.current); } catch {}
    routingRef.current = null;
    if (routeLayerRef.current) try { mapRef.current.removeLayer(routeLayerRef.current); } catch {}
    routeLayerRef.current = null;
    if (buildingNoteRef.current) try { mapRef.current.removeLayer(buildingNoteRef.current); } catch {}
    buildingNoteRef.current = null;
    setSteps([]);
    setRouteActive(false);
    setStepsOpen(false);
  };

  /* ----------------- Route fetching / play flow ----------------- */
  const fetchRouteSteps = async (routeId: string): Promise<RouteStep[]> => {
    const { data, error } = await (supabase as any).from("route_steps").select("id,route_id,order_index,custom_instruction,room_id,landmark_id,entrance_id,footway_id,parking_id").eq("route_id", routeId).order("order_index", { ascending: true });
    if (error) { console.error(error); return []; }
    return data || [];
  };

  /* ---------- latlngAndMetaOfStep ---------- */
  const latlngAndMetaOfStep = async (st: RouteStep) => {
    // ROOM
    if (st.room_id) {
      const { data: room } = await (supabase as any).from("rooms").select("id,floor_id,name,room_number,description,directions,image_url,map_image_path,room_type_id").eq("id", st.room_id).single();
      if (!room) return { ll: null, building: null, room: null };
      const { data: floor } = await (supabase as any).from("floors").select("id,building_id,floor_number").eq("id", room.floor_id).single();
      if (!floor) return { ll: null, building: null, room: null };
      const { data: building } = await (supabase as any).from("buildings").select("id,name,latitude,longitude,image_url,map_image_path").eq("id", floor.building_id).single();
      if (!building) return { ll: null, building: null, room: null };

      // resolve images
      const resolvedBuildingImg = await resolvePublicImageUrl(building.image_url || building.map_image_path || null);
      const resolvedRoomImg = await resolvePublicImageUrl(room.image_url || room.map_image_path || null);

      const fullRoom: Room = { ...room, floor: { id: floor.id, floor_number: floor.floor_number }, image_url: resolvedRoomImg || room.image_url || null };
      const fullBuilding: Building = { ...building, image_url: resolvedBuildingImg || building.image_url || null };

      return { ll: L.latLng(building.latitude, building.longitude), building: fullBuilding, room: fullRoom };
    }

    // LANDMARK
    if (st.landmark_id) {
      const { data: lm } = await (supabase as any).from("landmarks").select("location,building_id").eq("id", st.landmark_id).single();
      if (!lm?.location?.coordinates) return { ll: null, building: null, room: null };
      const [lng, lat] = lm.location.coordinates;
      let building = null;
      if (lm.building_id) {
        const { data: b } = await (supabase as any).from("buildings").select("id,name,latitude,longitude,image_url,map_image_path").eq("id", lm.building_id).single();
        if (b) {
          const resolved = await resolvePublicImageUrl(b.image_url || b.map_image_path || null);
          building = { ...b, image_url: resolved || b.image_url || null };
        }
      }
      return { ll: L.latLng(lat, lng), building, room: null };
    }

    // ENTRANCE
    if (st.entrance_id) {
      const { data: en } = await (supabase as any).from("entrances").select("location,building_id").eq("id", st.entrance_id).single();
      if (!en?.location?.coordinates) return { ll: null, building: null, room: null };
      const [lng, lat] = en.location.coordinates;
      let building = null;
      if (en.building_id) {
        const { data: b } = await (supabase as any).from("buildings").select("id,name,latitude,longitude,image_url,map_image_path").eq("id", en.building_id).single();
        if (b) {
          const resolved = await resolvePublicImageUrl(b.image_url || b.map_image_path || null);
          building = { ...b, image_url: resolved || b.image_url || null };
        }
      }
      return { ll: L.latLng(lat, lng), building, room: null };
    }

    return { ll: null, building: null, room: null };
  };

  /* ---------- playCurrentRouteStepIndex (maneja intra-edificio y pisos) ---------- */
  const prevBuildingIdRef = useRef<string | null>(null);
  const prevFloorNumberRef = useRef<number | null>(null);

  const playCurrentRouteStepIndex = async (idx: number, routeObj: Route, stepsArr: RouteStep[]) => {
    if (!userLoc) { toast.error("Activa el GPS para trazar el recorrido."); return; }
    clearRouteLayers();

    const st = stepsArr[idx];
    const meta = await latlngAndMetaOfStep(st);
    if (!meta.ll) { toast.message("Paso sin geolocalización. Avanza al siguiente."); return; }

    // set current building and room with resolved image_url (ya vienen resueltos desde latlngAndMetaOfStep)
    setCurrentStepBuilding(meta.building || null);
    setCurrentStepRoom(meta.room || null);

    const currentBuildingId = meta.building?.id || null;
    const prevBuildingId = prevBuildingIdRef.current;
    const prevFloorNumber = prevFloorNumberRef.current;
    const currentFloorNumber = meta.room?.floor?.floor_number ?? null;
    const isSameBuilding = prevBuildingId && currentBuildingId && prevBuildingId === currentBuildingId;
    const isSameFloor = isSameBuilding && prevFloorNumber != null && currentFloorNumber != null && prevFloorNumber === currentFloorNumber;

    // Si sigue en mismo edificio:
    if (isSameBuilding && (meta.room || st.custom_instruction)) {
      const linesBase: string[] = [];
      // Solo indicar piso si cambió respecto al anterior
      if (!isSameFloor && meta.room?.floor?.floor_number != null) linesBase.push(`Sube al piso ${meta.room.floor.floor_number}.`);
      // Instrucción principal (solo custom_instruction si no necesitamos repetir el piso)
      if (st.custom_instruction) linesBase.push(st.custom_instruction);
      // Añadir encabezado con el nombre del edificio (según requerimiento)
      if (meta.building?.name) linesBase.unshift(`Edificio: ${meta.building.name}.`);
      if (meta.room?.name) linesBase.push(`Destino: ${meta.room.name}${meta.room.room_number ? ` · ${meta.room.room_number}` : ""}.`);
      setSteps(linesBase);
      setRouteActive(true);
      setStepsOpen(true);
      speakReset();
      if (linesBase.length) speakAll(linesBase);
      prevBuildingIdRef.current = currentBuildingId;
      prevFloorNumberRef.current = currentFloorNumber;
      return;
    }

    // diferente edificio => trazar ruta (drawFootRoute) y prepend edificio+room info
    const from = L.latLng(userLoc.lat, userLoc.lng);
    await drawFootRoute(from, meta.ll, meta.room || undefined);

    // Header con edificio y destino
    const header: string[] = [];
    if (meta.building?.name) header.push(`Edificio: ${meta.building.name}.`);
    if (meta.room?.name) header.push(`Destino: ${meta.room.name}${meta.room.room_number ? ` · ${meta.room.room_number}` : ""}.`);
    // añadimos header al inicio de pasos (ya drawFootRoute llenó los steps con turn-by-turn)
    setSteps((prev) => header.concat(prev));
    setRouteActive(true);
    setStepsOpen(true);
    speakReset();
    prevBuildingIdRef.current = currentBuildingId;
    prevFloorNumberRef.current = currentFloorNumber;
  };

  const nextRouteStep = async () => {
    toast.message("Usa los controles del recorrido (Siguiente paso no implementado globalmente en este componente).");
  };

  /* ----------------- UI render ---------------- */
  return (
    <div className="relative h-screen w-full bg-background">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-20 bg-primary text-primary-foreground border-b border-primary/30">
        <div className="max-w-6xl mx-auto px-3 md:px-4 h-12 flex items-center justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <div className="font-semibold text-sm sm:text-base leading-none">UNEMI Campus</div>
            {userLoc ? <Badge variant="secondary" className="hidden sm:inline-flex">GPS activo</Badge> : gpsDenied ? <Badge variant="destructive" className="hidden sm:inline-flex">GPS no disponible</Badge> : <Badge className="hidden sm:inline-flex">Obteniendo GPS…</Badge>}
          </div>
          {/* Botón de inicio de sesión y salir
          <div className="flex items-center gap-2">
            {appUser ? (
              <>
                <Badge variant="outline" className="hidden sm:inline-flex"><UserCircle2 className="w-4 h-4 mr-1" /> {appUser.usuario}</Badge>
                <Button size="sm" variant="secondary" onClick={() => { setAppUser(null); localStorage.removeItem("appUser"); toast.message("Sesión cerrada."); }}><LogOut className="w-4 h-4 mr-2" /> Salir</Button>
              </>
            ) : (
              <Button size="sm" onClick={() => toast.message("Abrir login...") }><LogIn className="w-4 h-4 mr-2" /> Iniciar sesión</Button>
            )}
          </div>
          */}
        </div>
      </div>

      {/* mapa */}
      <div className="absolute inset-0 pt-12">
        <div ref={mapContainer} className="w-full h-full" />
      </div>

      {/* search card */}
      {!routeActive && (
        <Card className="absolute top-16 left-4 right-4 md:left-6 md:right-auto md:w-[840px] z-[1200] p-3 shadow-xl border-border/60 bg-card/95 backdrop-blur">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm text-muted-foreground">Escribe tu destino y te llevaré a la entrada más cercana o a la referencia.</div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => {
                const center = mapRef.current?.getCenter();
                const lat = userLoc?.lat ?? center?.lat; const lng = userLoc?.lng ?? center?.lng;
                if (lat == null || lng == null) { toast.error("No hay ubicación para compartir aún"); return; }
                const url = `${window.location.origin}${window.location.pathname}?lat=${lat.toFixed(6)}&lng=${lng.toFixed(6)}`;
                navigator.clipboard?.writeText(url).then(() => toast.success("Enlace copiado"));
              }}><MapPin className="w-4 h-4 mr-2" /> Compartir</Button>
            </div>
          </div>

          <form className="flex gap-2 items-end" onSubmit={(e) => { e.preventDefault(); handleSearch(); }}>
            <div className="flex-1">
              <Label className="text-xs">¿A dónde quieres ir?</Label>
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder='Ej: "Aula 201", "Bloque CRAI", "plazoleta" o nombre de un recorrido' />
            </div>
            <Button type="button" onClick={() => handleSearch()}><Search className="w-4 h-4 mr-2" /> Buscar</Button>
          </form>
        </Card>
      )}

      {/* primer edificio imagen top-right */}
      {firstRouteBuildingImage && (
        <div className="absolute top-14 right-3 z-[1200]">
          <div className="rounded-md border bg-card/90 backdrop-blur px-3 py-2 shadow max-w-xs">
            <div className="text-xs text-muted-foreground">Imagen inicio del recorrido</div>
            <div className="mt-2 w-40 h-24 rounded overflow-hidden border bg-muted">
              <img src={firstRouteBuildingImage} alt="Primer edificio" className="w-full h-full object-cover" onError={(e: any) => { e.currentTarget.style.display = "none"; }} />
            </div>
            <div className="mt-2 flex gap-2">
              <Button size="sm" onClick={() => setStepsOpen(true)}>Ver pasos</Button>
              <Button size="sm" variant="outline" onClick={() => setFirstRouteBuildingImage(null)}>Ocultar</Button>
            </div>
          </div>
        </div>
      )}

      {/* DIALOG: instrucciones (scrollable) - mostramos IMAGEN edificio y IMAGEN room debajo del texto */}
      <Dialog open={routeActive && stepsOpen && steps.length > 0} onOpenChange={(o) => { if (!o) { setStepsOpen(false); speakReset(); } }}>
        <DialogPortal>
          <DialogOverlay className="fixed inset-0 z-[3000] bg-black/50 backdrop-blur-sm" />
          <DialogContent className="z-[3001] p-0 max-w-none w-[100vw] sm:w-[720px] h-[85vh] sm:h-auto sm:max-h-[88vh] overflow-hidden" style={{ display: "flex", flexDirection: "column" }}>
            <div className="flex-1 overflow-auto">
              <DialogHeader className="px-5 pt-4">
                <DialogTitle>Instrucciones del recorrido</DialogTitle>
                <DialogDescription>Sigue los pasos en orden. Si estás dentro del mismo edificio, te leeré la instrucción personalizada.</DialogDescription>
              </DialogHeader>

              <div className="px-5 pb-3 flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => speakAll(steps)}>▶️ Leer</Button>
                <Button size="sm" variant="outline" onClick={speakPause}>{ttsPlaying ? "⏸️ Pausar" : "⏯️ Reanudar"}</Button>
                <div className="flex-1" />
                <Button size="sm" variant="ghost" onClick={() => { setStepsOpen(false); speakReset(); }}><X className="w-4 h-4" /></Button>
              </div>

              {/* pasos */}
              <div className="px-5 pb-2">
                <ol className="list-decimal pl-5 space-y-2 text-sm">
                  {steps.map((s, i) => <li key={i}>{s}</li>)}
                </ol>
              </div>
            
              {/* IMÁGENES: edificio PRIMERO, luego room. Ambas usando image_url resuelta */}
              <div className="px-5 pb-8">
                {currentStepBuilding?.image_url && (
                  <div className="mb-4">
                    <div className="text-sm text-muted-foreground mb-2">Imagen del edificio</div>
                    <div className="rounded-lg border bg-muted/40 p-2">
                      <img src={currentStepBuilding.image_url} alt="Edificio" className="w-full max-h-[320px] object-contain rounded-md" onError={(e: any) => { e.currentTarget.style.display = "none"; }} />
                    </div>
                  </div>
                )}

                {currentStepRoom?.image_url && (
                  <div>
                    <div className="text-sm text-muted-foreground mb-2">Imagen del espacio</div>
                    <div className="rounded-lg border bg-muted/40 p-2">
                      <img src={currentStepRoom.image_url} alt="Espacio" className="w-full max-h-[420px] object-contain rounded-md" onError={(e: any) => { e.currentTarget.style.display = "none"; }} />
                    </div>
                  </div>
                )}
              </div>
            </div>

            <DialogFooter className="flex items-center justify-between px-5 py-3">
              <div className="text-xs text-muted-foreground">Sigue las indicaciones y mantente atento al GPS.</div>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => { setStepsOpen(false); speakReset(); }}>Cerrar</Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </DialogPortal>
      </Dialog>

      {/* Botón flotante: Ver pasos (aparece cuando el modal está cerrado) */}
      {routeActive && steps.length > 0 && !stepsOpen && (
        <div className="absolute bottom-4 right-4 z-[1200]">
          <Button size="lg" onClick={() => setStepsOpen(true)}>
            Ver pasos
          </Button>
        </div>
      )}

      {/* Botón flotante: Nueva consulta */}
      {routeActive && (
        <div className="absolute bottom-4 left-4 z-[1200]">
          <Button size="lg" variant="secondary" onClick={() => {
            // resetUI logic: limpiar rutas y estados
            try {
              if (routingRef.current && mapRef.current) mapRef.current.removeControl(routingRef.current);
            } catch {}
            routingRef.current = null;
            try { if (routeLayerRef.current && mapRef.current) mapRef.current.removeLayer(routeLayerRef.current); } catch {}
            routeLayerRef.current = null;
            setSelectedRoom(null);
            setSelectedBuilding(null);
            setQuery("");
            routePathRef.current = null;
            triggerPtsRef.current = [];
            utteranceRef.current = null;
            setSteps([]);
            setStepsOpen(false);
            setRouteActive(false);
            setFirstRouteBuildingImage(null);
            prevBuildingIdRef.current = null;
            prevFloorNumberRef.current = null;
            toast.message("Nueva consulta iniciada");
          }}>
            <PanelTopOpen className="w-5 h-5 mr-2" /> Nueva consulta
          </Button>
        </div>
      )}

      {/* Results modal (NO IMÁGENES) */}
      <Dialog open={resultsOpen} onOpenChange={setResultsOpen}>
        <DialogPortal>
          <DialogOverlay className="fixed inset-0 z-[3000] bg-black/50 backdrop-blur-sm" />
          <DialogContent className="z-[3001] p-0 max-w-none w-[92vw] sm:w-[640px] h-[86vh] overflow-auto">
            <div className="px-5 pt-4">
              <DialogHeader>
                <DialogTitle>Resultados de búsqueda</DialogTitle>
                <DialogDescription>Selecciona el resultado al que quieres ir.</DialogDescription>
              </DialogHeader>
            </div>

            <div className="px-5 pb-6 overflow-auto">
              <div className="flex flex-col gap-4 mt-4">
                {searchResults.map((h: any) => {
                  if (h.kind === "room" && h.room) {
                    const r = h.room;
                    const block = r.building_name ?? "Bloque";
                    const piso = r.floor?.floor_number ? `Piso ${r.floor.floor_number}` : "";
                    const tipo = r.room_type_name ?? "";
                    return (
                      <div key={r.id} className="p-4 border rounded-lg bg-card">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="text-lg font-semibold">{r.name}</div>
                            <div className="text-sm text-muted-foreground mt-1">{block} · {piso} · {tipo}</div>
                          </div>
                          <div>
                            <Button size="sm" onClick={async () => { setResultsOpen(false); await focusRoom(r); }}>Ir</Button>
                          </div>
                        </div>
                      </div>
                    );
                  } else if (h.kind === "landmark" && h.landmark) {
                    const lm = h.landmark;
                    return (
                      <div key={lm.id} className="p-4 border rounded-lg bg-card">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="text-lg font-semibold">{lm.name ?? lm.type}</div>
                            <div className="text-sm text-muted-foreground mt-1">{lm.type}</div>
                          </div>
                          <div>
                            <Button size="sm" onClick={async () => { setResultsOpen(false); await focusLandmark(lm); }}>Ir</Button>
                          </div>
                        </div>
                      </div>
                    );
                  } else if (h.kind === "building" && h.building) {
                    const b = h.building;
                    return (
                      <div key={b.id} className="p-4 border rounded-lg bg-card">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="text-lg font-semibold">{b.name}</div>
                            <div className="text-sm text-muted-foreground mt-1">Bloque · {b.building_code ?? ""}</div>
                          </div>
                          <div>
                            <Button size="sm" onClick={() => { setResultsOpen(false); handleSelectBuilding(b, true); }}>Ir</Button>
                          </div>
                        </div>
                      </div>
                    );
                  }
                  return null;
                })}
              </div>
            </div>

            <div className="px-5 pb-5">
              <div className="flex justify-end">
                <Button variant="outline" onClick={() => setResultsOpen(false)}>Cerrar</Button>
              </div>
            </div>
          </DialogContent>
        </DialogPortal>
      </Dialog>
    </div>
  );
}
