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
} from "@/components/ui/dialog";
import {
  Search,
  PanelTopOpen,
  X,
  MapPin,
  LogIn,
  LogOut,
  UserCircle2,
} from "lucide-react";

// Fix iconos Leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

// ======= Helpers de texto/normalización =======
const norm = (s: string) =>
  (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

const normAlnum = (s: string) => norm(s).replace(/[^\p{L}\p{N}]/gu, "");

const tokenize = (s: string) =>
  norm(s)
    .split(/\s+/)
    .map((t) => t.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter((t) => t.length >= 2 || /^\d+$/.test(t));

const strongTokensOf = (tokens: string[]) =>
  tokens.filter((t) => t.length >= 3 || /^\d+$/.test(t));

const UNEMI_CENTER: [number, number] = [-2.14898719, -79.60420553];

// ======= Tipos =======
type BuildingState = "HABILITADO" | "REPARACIÓN";
type Building = {
  id: string;
  name: string;
  description: string | null;
  latitude: number;
  longitude: number;
  total_floors: number;
  building_code: string | null;
  state: BuildingState;
  image_url?: string | null;
};

type Floor = {
  id: string;
  building_id: string;
  floor_number: number;
  floor_name: string | null;
};

type Room = {
  id: string;
  floor_id: string;
  name: string;
  room_number: string | null;
  description: string | null;
  directions: string | null;
  room_type_id: string;
  capacity: number | null;
  equipment?: string[] | null;
  keywords?: string[] | null;
  actividades?: string[] | null;
  target?: "public" | "student" | "admin";
  image_url?: string | null;
  map_image_path?: string | null;
  floor?: { id: string; floor_number: number };
};

type Footway = {
  id: string;
  state: "ABIERTO" | "CERRADO";
  geom: { type: "LineString"; coordinates: [number, number][] } | string;
};

type Entrance = {
  id: string;
  building_id: string | null;
  name: string | null;
  type: "pedestrian" | "vehicular" | "both";
  location: { type: "Point"; coordinates: [number, number] };
};

type Landmark = {
  id: string;
  name: string | null;
  type: "plazoleta" | "bar" | "corredor" | "otro";
  location: { type: "Point"; coordinates: [number, number] };
  building_id?: string | null;
};

type Route = { id: string; name: string; description: string | null; is_active: boolean };
type RouteStep = {
  id: string;
  route_id: string;
  order_index: number;
  custom_instruction: string | null;
  room_id: string | null;
  landmark_id: string | null;
  entrance_id: string | null;
  footway_id: string | null;
  parking_id: string | null;
};

// ======= Utilidades geoespaciales / grafo =======
const haversine = (a: L.LatLngExpression, b: L.LatLngExpression) =>
  L.latLng(a).distanceTo(L.latLng(b));
const keyOf = (lat: number, lng: number) => `${lat.toFixed(6)},${lng.toFixed(6)}`;

type NodeId = string;
type Node = { id: NodeId; lat: number; lng: number; edges: { to: NodeId; w: number }[] };
type Segment = { a: L.LatLng; b: L.LatLng; aId: NodeId; bId: NodeId };

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

const nearestProjection = (p: L.LatLng, segments: Segment[]) => {
  let best = { Q: p, dist: Infinity, t: 0, segIndex: -1 };
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i];
    const proj = projectPointToSegment(p, s.a, s.b);
    if (proj.dist < best.dist) best = { Q: proj.Q, dist: proj.dist, t: proj.t, segIndex: i };
  }
  return best;
};

function cloneGraph(G: Map<NodeId, Node>) {
  const G2 = new Map<NodeId, Node>();
  for (const [id, n] of G.entries()) {
    G2.set(id, { id, lat: n.lat, lng: n.lng, edges: n.edges.map((e) => ({ ...e })) });
  }
  return G2;
}

function integrateProjection(
  G: Map<NodeId, Node>,
  segments: Segment[],
  proj: { Q: L.LatLng; segIndex: number }
) {
  const seg = segments[proj.segIndex];
  const Qid = keyOf(proj.Q.lat, proj.Q.lng);
  if (!G.has(Qid)) {
    G.set(Qid, { id: Qid, lat: proj.Q.lat, lng: proj.Q.lng, edges: [] });
  }
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

// ======= Componente =======
export default function PublicNavigator() {
  // Estados básicos
  const [query, setQuery] = useState("");
  const [userLoc, setUserLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsDenied, setGpsDenied] = useState(false);
  const gpsFollow = true;

  // Auth simple
  const [loginOpen, setLoginOpen] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [appUser, setAppUser] = useState<{ id: number; usuario: string; role: "guest" | "student" | "admin" } | null>(null);

  // Datos
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [selectedBuilding, setSelectedBuilding] = useState<Building | null>(null);
  const [buildingFloors, setBuildingFloors] = useState<Floor[]>([]);
  const [buildingRooms, setBuildingRooms] = useState<Room[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);

  const [footways, setFootways] = useState<Footway[]>([]);
  const [entrances, setEntrances] = useState<Entrance[]>([]);
  const [landmarks, setLandmarks] = useState<Landmark[]>([]);

  // Grafo
  const graphRef = useRef<Map<NodeId, Node> | null>(null);
  const segmentsRef = useRef<Segment[] | null>(null);

  // Mapa
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.Marker[]>([]);
  const routingRef = useRef<any>(null);
  const userMarkerRef = useRef<L.Marker | null>(null);
  const buildingNoteRef = useRef<L.Tooltip | null>(null);
  const routeLayerRef = useRef<L.Layer | null>(null);

  // Mascota icon
  const walkerRef = useRef<L.Marker | null>(null);
  const walkerIcon = L.icon({
    iconUrl: "/mascota-unemi.png",
    iconSize: [72, 72],
    iconAnchor: [36, 60],
    tooltipAnchor: [0, -60],
  });

  // Guía / TTS
  const [steps, setSteps] = useState<string[]>([]);
  const [ttsPlaying, setTtsPlaying] = useState(false);
  const [nextStepPointer, setNextStepPointer] = useState(0);
  const [routeActive, setRouteActive] = useState(false);
  const [stepsOpen, setStepsOpen] = useState(false);

  // Recorridos
  const [routePlaying, setRoutePlaying] = useState<{ route: Route; steps: RouteStep[] } | null>(null);
  const [routeIdx, setRouteIdx] = useState(0);

  // Contexto visual del paso actual
  const [currentStepRoom, setCurrentStepRoom] = useState<Room | null>(null);
  const [currentStepBuilding, setCurrentStepBuilding] = useState<Building | null>(null);

  // Imagen del primer edificio del recorrido (nuevo requerimiento)
  const [firstRouteBuildingImage, setFirstRouteBuildingImage] = useState<string | null>(null);

  // Refs para ruteo por voz
  const routePathRef = useRef<L.LatLng[] | null>(null);
  const triggerPtsRef = useRef<L.LatLng[]>([]);
  const spokenStepIdxRef = useRef<number>(-1);
  const lastSpeakTsRef = useRef<number>(0);

  // Prev step refs (para evitar repetir piso)
  const prevStepBuildingIdRef = useRef<string | null>(null);
  const prevStepFloorNumberRef = useRef<number | null>(null);

  // Estados para modal de selección de resultados de búsqueda
  type Hit =
    | { kind: "room"; room: Room; label: string }
    | { kind: "landmark"; landmark: Landmark; label: string }
    | { kind: "building"; building: Building; label: string };

  const [searchHits, setSearchHits] = useState<Hit[]>([]);
  const [searchModalOpen, setSearchModalOpen] = useState(false);

  // Cargar sesión simple desde localStorage (si la usas)
  useEffect(() => {
    const raw = localStorage.getItem("appUser");
    if (raw) {
      try {
        const u = JSON.parse(raw);
        if (u?.role) setAppUser(u);
      } catch {}
    }
  }, []);

  // LOGIN / LOGOUT
  const doLogout = () => {
    setAppUser(null);
    localStorage.removeItem("appUser");
    toast.message("Sesión cerrada.");
  };

  const doLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthLoading(true);
    try {
      const { data, error } = await (supabase as any).rpc("verify_user", {
        p_usuario: username,
        p_password: password,
      });
      if (error) throw error;
      const row = (Array.isArray(data) ? data[0] : data) as { id: number; usuario: string; role: string } | undefined;
      if (!row) {
        setAuthError("Usuario o contraseña incorrectos.");
      } else {
        const r = row.role?.toLowerCase() === "admin" || row.role?.toLowerCase() === "super_admin"
          ? "admin"
          : row.role?.toLowerCase() === "student" || row.role?.toLowerCase() === "editor" || row.role?.toLowerCase() === "viewer"
            ? "student"
            : "guest";
        const u = { id: row.id, usuario: row.usuario, role: r as "guest" | "student" | "admin" };
        setAppUser(u);
        localStorage.setItem("appUser", JSON.stringify(u));
        setLoginOpen(false);
        toast.success(`Hola ${u.usuario}! Rol: ${u.role}`);
      }
    } catch (err: any) {
      setAuthError(err?.message || "No se pudo iniciar sesión.");
    } finally {
      setAuthLoading(false);
    }
  };

  // INIT: GPS + carga datos
  useEffect(() => {
    if ("geolocation" in navigator) {
      navigator.geolocation.watchPosition(
        (pos) => setUserLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => {
          setGpsDenied(true);
          toast.message("No se pudo obtener tu ubicación.");
        },
        { enableHighAccuracy: true, maximumAge: 5000 }
      );
    } else setGpsDenied(true);

    (async () => {
      const { data, error } = await (supabase as any)
        .from("buildings")
        .select("id,name,description,latitude,longitude,total_floors,building_code,state,image_url")
        .eq("state", "HABILITADO")
        .order("name", { ascending: true });
      if (error) toast.error("Error cargando edificios");
      else setBuildings((data || []) as Building[]);
    })();

    (async () => {
      const { data, error } = await (supabase as any)
        .from("footways")
        .select("id,state,geom")
        .eq("state", "ABIERTO");
      if (error) toast.error("No se pudo cargar la red peatonal");
      else {
        const normF = (data || []).map((fw: any) => ({
          id: fw.id,
          state: fw.state,
          geom: typeof fw.geom === "string" ? JSON.parse(fw.geom) : fw.geom,
        })) as Footway[];
        setFootways(normF);
      }
    })();

    (async () => {
      const { data, error } = await (supabase as any)
        .from("entrances")
        .select("id,building_id,name,type,location");
      if (error) toast.error("No se pudieron cargar las entradas");
      else setEntrances((data || []) as Entrance[]);
    })();

    (async () => {
      const { data, error } = await (supabase as any)
        .from("landmarks")
        .select("id,name,type,location,building_id");
      if (error) toast.error("No se pudieron cargar las referencias");
      else setLandmarks((data || []) as Landmark[]);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // MAP: crea mapa
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    const map = L.map(mapContainer.current, {
      zoomControl: true,
      attributionControl: true,
    }).setView(UNEMI_CENTER, 17);
    mapRef.current = map;

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors",
      maxZoom: 19,
    }).addTo(map);

    addBuildingMarkers();

    return () => {
      if (!mapRef.current) return;
      markersRef.current.forEach((m) => mapRef.current?.removeLayer(m));
      if (routingRef.current) mapRef.current.removeControl(routingRef.current);
      if (buildingNoteRef.current) mapRef.current.removeLayer(buildingNoteRef.current);
      if (routeLayerRef.current) {
        mapRef.current.removeLayer(routeLayerRef.current);
        routeLayerRef.current = null;
      }
      if (walkerRef.current) mapRef.current.removeLayer(walkerRef.current);
      if (userMarkerRef.current) mapRef.current.removeLayer(userMarkerRef.current);
      mapRef.current.remove();
      mapRef.current = null;
    };
  }, []);

  // add markers cuando cambian buildings
  useEffect(() => {
    addBuildingMarkers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildings]);

  // marcador usuario + mascota
  useEffect(() => {
    if (!mapRef.current || !userLoc) return;

    if (!userMarkerRef.current) {
      userMarkerRef.current = L.marker([userLoc.lat, userLoc.lng], { title: "Tu ubicación" })
        .addTo(mapRef.current)
        .bindPopup("<b>Tu ubicación</b>");
    } else {
      userMarkerRef.current.setLatLng([userLoc.lat, userLoc.lng]);
    }

    if (gpsFollow) {
      if (!walkerRef.current) {
        walkerRef.current = L.marker([userLoc.lat, userLoc.lng], {
          icon: walkerIcon,
          zIndexOffset: 1000,
        })
          .addTo(mapRef.current)
          .bindTooltip("¡Sígueme! 🐯", {
            permanent: false,
            direction: "top",
            offset: [0, -36],
          });
      } else {
        walkerRef.current.setLatLng([userLoc.lat, userLoc.lng]);
      }
    }
  }, [userLoc, gpsFollow]);

  // addBuildingMarkers
  const addBuildingMarkers = () => {
    if (!mapRef.current) return;
    markersRef.current.forEach((m) => mapRef.current?.removeLayer(m));
    markersRef.current = [];

    buildings.forEach((b) => {
      const customIcon = L.divIcon({
        className: "custom-building-marker",
        html: `<div class="bg-primary text-primary-foreground rounded-full w-3.5 h-3.5 shadow-lg border-2 border-background"></div>`,
        iconSize: [16, 16],
        iconAnchor: [8, 8],
      });

      const marker = L.marker([b.latitude, b.longitude], {
        icon: customIcon,
        title: b.name,
      }).addTo(mapRef.current!);
      marker.on("click", () => handleSelectBuilding(b, true));
      markersRef.current.push(marker);
    });
  };

  // ====== Búsqueda (rooms/buildings/landmarks) ======
  const findBuilding = (termRaw: string): Building[] => {
    let t = norm(termRaw).replace(/^bloque\s+/, "");
    const tokens = tokenize(t);
    const strong = strongTokensOf(tokens);
    if (strong.length === 0) return [];
    const strict = buildings.filter((b) => {
      const label = `${b.name} ${b.building_code ?? ""}`;
      return strong.every((t) => normAlnum(label).includes(t));
    });
    if (strict.length > 0) return strict;
    return buildings.filter((b) => {
      const label = `${b.name} ${b.building_code ?? ""}`;
      return strong.some((t) => normAlnum(label).includes(t));
    });
  };

  const findRooms = async (termRaw: string): Promise<Room[]> => {
    const raw = termRaw.trim();
    const tokens = tokenize(raw);
    const strong = strongTokensOf(tokens);

    const kwArray = `{${(strong.length > 0 ? strong : tokens).join(",")}}`;
    const orParts: string[] = [
      `name.ilike.%${raw}%`,
      `room_number.ilike.%${raw}%`,
    ];
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

    const baseTokens = (strong.length > 0 ? strong : tokens);
    if (baseTokens.length === 0) return (data || []) as Room[];

    const filteredStrict = (data || []).filter((r: any) => {
      const bag = [
        r.name ?? "",
        r.room_number ?? "",
        r.description ?? "",
        ...(r.keywords ?? []),
        ...(r.actividades ?? []),
      ].join(" ");
      return strong.length > 0
        ? strong.every((t) => normAlnum(bag).includes(t))
        : baseTokens.some((t) => normAlnum(bag).includes(t));
    }) as Room[];

    if (filteredStrict.length > 0) return filteredStrict;

    return ((data || []).filter((r: any) => {
      const bag = [
        r.name ?? "",
        r.room_number ?? "",
        r.description ?? "",
        ...(r.keywords ?? []),
        ...(r.actividades ?? []),
      ].join(" ");
      return baseTokens.some((t) => normAlnum(bag).includes(t));
    }) as Room[]);
  };

  const findLandmarksMany = async (termRaw: string): Promise<Landmark[]> => {
    const tokens = tokenize(termRaw);
    const strong = strongTokensOf(tokens);

    const { data, error } = await (supabase as any)
      .from("landmarks")
      .select("id,name,type,location,building_id")
      .limit(200);

    if (error) {
      console.error(error);
      return [];
    }

    const list = (data || []) as Landmark[];
    return list.filter((lm) => {
      const label = `${lm.name ?? ""} ${lm.type}`;
      return strong.length > 0 ? strong.every((t) => normAlnum(label).includes(t)) : tokens.some((t) => normAlnum(label).includes(t));
    });
  };

  // ====== Grafos y ruteo (mismo que antes) ======
  const buildGraphAndSegments = (foot: Footway[]) => {
    const G = new Map<NodeId, Node>();
    const segs: Segment[] = [];
    for (const fw of foot) {
      const g = (fw as any).geom;
      const geom = typeof g === "string" ? JSON.parse(g) : g;
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
      const { G, segments } = ensureGraphWithSegments();
      if (G && G.size > 0 && segments && segments.length > 0) return true;
      await new Promise((r) => setTimeout(r, stepMs));
    }
    return false;
  };

  const bestEntranceForBuilding = (buildingId: string, fromLL: L.LatLng): L.LatLng => {
    const list = entrances.filter((e) => e.building_id === buildingId);
    if (list.length === 0) {
      const b = buildings.find((x) => x.id === buildingId)!;
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

  // ====== TTS helpers ======
  const speakAll = (texts: string[]) => {
    if (!("speechSynthesis" in window)) {
      toast("Tu navegador no soporta voz.");
      return;
    }
    if (!texts || texts.length === 0) return;
    try {
      window.speechSynthesis.cancel();
    } catch {}
    const u = new SpeechSynthesisUtterance(texts.join(". "));
    u.lang = "es-ES";
    u.rate = 1;

    u.onend = () => setTtsPlaying(false);
    u.onerror = (ev: any) => {
      console.warn("TTS error", ev);
      setTtsPlaying(false);
      toast.message("TTS: reproducción cancelada o falla en el navegador.");
    };

    try {
      window.speechSynthesis.speak(u);
      setTtsPlaying(true);
    } catch (e) {
      console.error("speak error", e);
      toast.message("No se pudo reproducir la voz (intenta otro navegador).");
    }
  };
  const speakPause = () => {
    if (!("speechSynthesis" in window)) return;
    if (window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
      window.speechSynthesis.pause();
      setTtsPlaying(false);
    } else if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
      setTtsPlaying(true);
    }
  };
  const speakReset = () => {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    setTtsPlaying(false);
  };

  // ====== Selección edificio/room ======
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
      const { data: floors, error: floorsErr } = await (supabase as any)
        .from("floors")
        .select("id,building_id,floor_number,floor_name")
        .eq("building_id", buildingId)
        .order("floor_number", { ascending: true });
      if (floorsErr) throw floorsErr;
      setBuildingFloors((floors || []) as Floor[]);

      const floorIds = (floors || []).map((f) => f.id);
      if (floorIds.length === 0) {
        setBuildingRooms([]);
        return;
      }

      const allowed = ["public", "student", "admin"].slice(0, 1 + (appUser?.role === "student" ? 1 : 0) + (appUser?.role === "admin" ? 1 : 0));
      const { data: rooms, error: roomsErr } = await (supabase as any)
        .from("rooms")
        .select("id,floor_id,name,room_number,description,directions,room_type_id,capacity,equipment,keywords,actividades,target,image_url,map_image_path")
        .in("floor_id", floorIds)
        .in("target", allowed)
        .order("name", { ascending: true });
      if (roomsErr) throw roomsErr;

      const fMap = new Map<string, Floor>();
      (floors || []).forEach((f) => fMap.set(f.id, f as Floor));
      const enhanced = (rooms || []).map((r) => ({
        ...r,
        floor: fMap.get(r.floor_id)
          ? { id: r.floor_id, floor_number: fMap.get(r.floor_id)!.floor_number }
          : undefined,
      })) as Room[];

      setBuildingRooms(enhanced);
    } catch (e) {
      console.error(e);
      toast.error("Error cargando pisos/rooms");
    }
  };

  const focusRoom = async (room: Room) => {
    try {
      const { data: floor, error: fErr } = await (supabase as any)
        .from("floors")
        .select("id,building_id,floor_number")
        .eq("id", room.floor_id)
        .single();
      if (fErr) throw fErr;

      const { data: building, error: bErr } = await (supabase as any)
        .from("buildings")
        .select("id,name,description,latitude,longitude,total_floors,building_code,state,image_url")
        .eq("id", floor.building_id)
        .eq("state", "HABILITADO")
        .single();
      if (bErr || !building) {
        toast.error("El edificio no está habilitado.");
        return;
      }

      await handleSelectBuilding(building as Building, true);

      const roomWithFloor: Room = {
        ...room,
        floor: { id: floor.id, floor_number: (floor as any).floor_number },
      };
      setSelectedRoom(roomWithFloor);

      // set building context BEFORE drawing route
      setCurrentStepBuilding(building as Building);
      setFirstRouteBuildingImage((building as Building).image_url ?? null);

      if (!userLoc) {
        toast.error("Activa el GPS para trazar la ruta a la entrada.");
        return;
      }
      const from = L.latLng(userLoc.lat, userLoc.lng);
      const to = bestEntranceForBuilding((building as Building).id, from);
      await drawFootRoute(from, to, roomWithFloor, (building as Building).name, (building as Building).image_url ?? null);
    } catch (e) {
      console.error(e);
      toast.error("No se pudo focalizar el espacio");
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

  // ====== Rutas / play by name (fetch route + pasos) ======
  const latlngAndMetaOfStep = async (st: RouteStep): Promise<{ ll: L.LatLng | null; building: Building | null; room: Room | null }> => {
    // ROOM
    if (st.room_id) {
      const { data: room } = await (supabase as any)
        .from("rooms")
        .select("id,floor_id,name,room_number,description,directions,image_url,map_image_path")
        .eq("id", st.room_id)
        .single();
      if (!room) return { ll: null, building: null, room: null };

      const { data: floor } = await (supabase as any)
        .from("floors").select("id,building_id,floor_number").eq("id", room.floor_id).single();
      if (!floor) return { ll: null, building: null, room: null };

      const { data: building } = await (supabase as any)
        .from("buildings").select("id,name,latitude,longitude,image_url").eq("id", floor.building_id).single();
      if (!building) return { ll: null, building: null, room: null };

      const fullRoom: Room = {
        ...room,
        floor: { id: floor.id, floor_number: (floor as any).floor_number },
      };
      return {
        ll: L.latLng(building.latitude, building.longitude),
        building: building as Building,
        room: fullRoom,
      };
    }

    // LANDMARK
    if (st.landmark_id) {
      const { data: lm } = await (supabase as any)
        .from("landmarks").select("location,building_id").eq("id", st.landmark_id).single();
      if (!lm?.location?.coordinates) return { ll: null, building: null, room: null };
      const [lng, lat] = lm.location.coordinates;
      let building: Building | null = null;
      if (lm.building_id) {
        const { data: b } = await (supabase as any)
          .from("buildings").select("id,name,latitude,longitude,image_url").eq("id", lm.building_id).single();
        building = (b || null) as Building | null;
      }
      return { ll: L.latLng(lat, lng), building, room: null };
    }

    // ENTRANCE
    if (st.entrance_id) {
      const { data: en } = await (supabase as any)
        .from("entrances").select("location,building_id").eq("id", st.entrance_id).single();
      if (!en?.location?.coordinates) return { ll: null, building: null, room: null };
      const [lng, lat] = en.location.coordinates;
      let building: Building | null = null;
      if (en.building_id) {
        const { data: b } = await (supabase as any)
          .from("buildings").select("id,name,latitude,longitude,image_url").eq("id", en.building_id).single();
        building = (b || null) as Building | null;
      }
      return { ll: L.latLng(lat, lng), building, room: null };
    }

    return { ll: null, building: null, room: null };
  };

  const fetchRouteByName = async (term: string): Promise<Route | null> => {
    const { data, error } = await (supabase as any)
      .from("routes")
      .select("id,name,description,is_active")
      .ilike("name", `%${term}%`)
      .eq("is_active", true)
      .limit(1);
    if (error) {
      console.error(error);
      toast.error("Error buscando recorrido");
      return null;
    }
    return data?.[0] ?? null;
  };

  const fetchRouteSteps = async (routeId: string): Promise<RouteStep[]> => {
    const { data, error } = await (supabase as any)
      .from("route_steps")
      .select("id,route_id,order_index,custom_instruction,room_id,landmark_id,entrance_id,footway_id,parking_id")
      .eq("route_id", routeId)
      .order("order_index", { ascending: true });
    if (error) {
      console.error(error);
      toast.error("Error cargando pasos del recorrido");
      return [];
    }
    return data || [];
  };

  const startRouteByName = async (term: string) => {
    const r = await fetchRouteByName(term);
    if (!r) {
      toast.message("No encontré un recorrido con ese nombre.");
      return;
    }
    const steps = await fetchRouteSteps(r.id);
    if (!steps.length) {
      toast.message("Este recorrido no tiene pasos.");
      return;
    }

    setRoutePlaying({ route: r, steps });
    setRouteIdx(0);
    toast.success(`Recorrido: ${r.name}`);

    // limpiar imagen previa
    setFirstRouteBuildingImage(null);

    // obtener imagen del primer paso (si tiene building/room con image_url)
    try {
      const firstMeta = await latlngAndMetaOfStep(steps[0]);
      const img = firstMeta.building?.image_url ?? firstMeta.room?.image_url ?? null;
      setFirstRouteBuildingImage(img ?? null);
    } catch (e) {
      console.warn("No pude obtener imagen del primer paso", e);
      setFirstRouteBuildingImage(null);
    }

    // reiniciar contexto y reproducir primer paso
    prevStepBuildingIdRef.current = null;
    prevStepFloorNumberRef.current = null;
    await playCurrentRouteStep(0, r, steps);
  };

  const playCurrentRouteStep = async (idx: number, route: Route, stepsArr: RouteStep[]) => {
    if (!userLoc) {
      toast.error("Activa el GPS para trazar el recorrido.");
      return;
    }
    clearRouteLayers();
    if (routingRef.current && mapRef.current) {
      try { mapRef.current.removeControl(routingRef.current); } catch {}
      routingRef.current = null;
    }

    const st = stepsArr[idx];
    const meta = await latlngAndMetaOfStep(st);
    if (!meta.ll) {
      toast.message("Paso sin geolocalización. Avanza al siguiente.");
      return;
    }

    // Actualizar contexto visual del modal
    setCurrentStepRoom(meta.room);
    setCurrentStepBuilding(meta.building || null);

    const currentBuildingId = meta.building?.id || null;
    const prevBuildingId = prevStepBuildingIdRef.current;
    const prevFloor = prevStepFloorNumberRef.current;
    const nextFloorNumber = meta.room?.floor?.floor_number ?? null;

    const isSameBuildingAsPrev = prevBuildingId !== null && currentBuildingId !== null && currentBuildingId === prevBuildingId;

    // Build header with building name if available
    const buildingHeader = meta.building ? `Edificio: ${meta.building.name}` : null;

    // INTRA-BLOQUE
    if (isSameBuildingAsPrev && (meta.room || st.custom_instruction)) {
      const linesBase: string[] = [];
      if (buildingHeader) linesBase.push(buildingHeader);

      if (nextFloorNumber != null) {
        if (prevFloor == null || prevFloor !== nextFloorNumber) {
          linesBase.push(`Sube al piso ${nextFloorNumber}.`);
        } else {
          // mismo piso -> no repetir
        }
      }

      if (st.custom_instruction) linesBase.push(st.custom_instruction);

      if (meta.room?.directions && !st.custom_instruction) {
        linesBase.push(`Indicaciones: ${meta.room.directions}`);
      }

      setSteps(linesBase);
      setNextStepPointer(0);
      setRouteActive(true);
      setStepsOpen(true);
      speakReset();
      if (linesBase.length) speakAll(linesBase);

      prevStepBuildingIdRef.current = currentBuildingId;
      prevStepFloorNumberRef.current = nextFloorNumber;
      return;
    }

    // EXTRA-BLOQUE -> trazar ruta
    const fromLL = L.latLng(userLoc.lat, userLoc.lng);
    await drawFootRoute(fromLL, meta.ll, meta.room || undefined, meta.building?.name ?? undefined, meta.building?.image_url ?? undefined);

    prevStepBuildingIdRef.current = currentBuildingId;
    prevStepFloorNumberRef.current = nextFloorNumber;
  };

  const nextRouteStep = async () => {
    if (!routePlaying) return;
    const next = routeIdx + 1;
    if (next >= routePlaying.steps.length) {
      toast.success("Recorrido finalizado 🎉");
      setRoutePlaying(null);
      setRouteIdx(0);
      clearRouteLayers();
      setFirstRouteBuildingImage(null);
      prevStepBuildingIdRef.current = null;
      prevStepFloorNumberRef.current = null;
      return;
    }
    setRouteIdx(next);
    await playCurrentRouteStep(next, routePlaying.route, routePlaying.steps);
  };

  // ====== drawFootRoute (acepta ctxBuildingName/ctxBuildingImage) ======
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

  const drawFootRoute = async (
    fromLL: L.LatLng,
    toLL: L.LatLng,
    roomInfo?: Room,
    ctxBuildingName?: string | undefined,
    ctxBuildingImage?: string | null | undefined
  ) => {
    if (!mapRef.current) return;

    // limpiar antes
    if (routingRef.current && mapRef.current) {
      try { mapRef.current.removeControl(routingRef.current); } catch {}
      routingRef.current = null;
    }
    if (routeLayerRef.current && mapRef.current) {
      try { mapRef.current.removeLayer(routeLayerRef.current); } catch {}
      routeLayerRef.current = null;
    }

    const ready = await waitForGraphReady();
    setRouteActive(true);
    setStepsOpen(false);

    // set building image for modal top-right if provided
    if (ctxBuildingImage) setFirstRouteBuildingImage(ctxBuildingImage);

    try {
      await import("leaflet-routing-machine");

      // 1) Red peatonal interna
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

          const final = ctxBuildingName ? [ `Edificio: ${ctxBuildingName}`, ...out ] : out;
          setSteps(final);

          routePathRef.current = campusPath;
          triggerPtsRef.current = computeTurnPoints(campusPath);
          spokenStepIdxRef.current = -1;
          setNextStepPointer(0);
          speakReset();
          setStepsOpen(true);
          return;
        }
      }

      // 2) Fallback OSRM
      const plan = (L as any).Routing.plan([fromLL, toLL], {
        draggableWaypoints: false,
        addWaypoints: false,
        createMarker: (i: number, wp: any) =>
          L.marker(wp.latLng, { title: i === 0 ? "Origen (a pie)" : "Destino" }),
      });

      const ctrl = (L as any).Routing.control({
        plan,
        router: (L as any).Routing.osrmv1({
          serviceUrl: "https://router.project-osrm.org/route/v1",
          profile: "foot",
          timeout: 12000,
          steps: true,
          annotations: true,
        }),
        fitSelectedRoutes: true,
        routeWhileDragging: false,
        showAlternatives: false,
        show: false,
      }).addTo(mapRef.current!);
      routingRef.current = ctrl;

      ctrl.on("routesfound", (e: any) => {
        const route = e.routes?.[0];
        const coords: L.LatLng[] = (route?.coordinates || []).map((c: any) =>
          L.latLng(c.lat, c.lng)
        );
        const insts = buildTurnByTurn(coords, toLL);
        const out = (() => {
          const base = [...insts];
          if (roomInfo?.floor?.floor_number != null) base.push(`El destino está en el piso ${roomInfo.floor.floor_number}.`);
          const d = (roomInfo?.directions || "").trim();
          if (d) base.push(`Indicaciones adicionales: ${d}`);
          return base;
        })();

        const final = ctxBuildingName ? [ `Edificio: ${ctxBuildingName}`, ...out ] : out;
        setSteps(final);

        routePathRef.current = coords;
        triggerPtsRef.current = computeTurnPoints(coords);
        spokenStepIdxRef.current = -1;
        setNextStepPointer(0);
        speakReset();
        setStepsOpen(true);
      });

      ctrl.on("routingerror", () => {
        toast.message("No se pudo obtener ruta peatonal, dibujo una guía directa.");
        drawFallbackLine(fromLL, toLL);
        let insts = [
          `Camina en línea recta hacia el destino (≈ ${Math.round(haversine(fromLL, toLL))} m).`,
        ];
        if (roomInfo?.floor?.floor_number != null) insts.push(`El destino está en el piso ${roomInfo.floor.floor_number}.`);
        const d = (roomInfo?.directions || "").trim();
        if (d) insts.push(`Indicaciones adicionales: ${d}`);

        const final = ctxBuildingName ? [ `Edificio: ${ctxBuildingName}`, ...insts ] : insts;
        setSteps(final);

        routePathRef.current = [fromLL, toLL];
        triggerPtsRef.current = [toLL];
        spokenStepIdxRef.current = -1;
        setNextStepPointer(0);
        speakReset();
        setStepsOpen(true);
      });
    } catch (e) {
      console.error(e);
      toast.error("No se pudo trazar la ruta. Te muestro una guía directa.");
      drawFallbackLine(fromLL, toLL);
      let insts = [`Camina en línea recta hacia el destino (≈ ${Math.round(haversine(fromLL, toLL))} m).`];
      if (roomInfo?.floor?.floor_number != null) insts.push(`El destino está en el piso ${roomInfo.floor.floor_number}.`);
      const d = (roomInfo?.directions || "").trim();
      if (d) insts.push(`Indicaciones adicionales: ${d}`);

      const final = ctxBuildingName ? [ `Edificio: ${ctxBuildingName}`, ...insts ] : insts;
      setSteps(final);

      routePathRef.current = [fromLL, toLL];
      triggerPtsRef.current = [toLL];
      spokenStepIdxRef.current = -1;
      setNextStepPointer(0);
      speakReset();
      setStepsOpen(true);
    }
  };

  const drawFallbackLine = (from: L.LatLng, to: L.LatLng) => {
    if (!mapRef.current) return;
    if (routeLayerRef.current) {
      try { mapRef.current.removeLayer(routeLayerRef.current); } catch {}
      routeLayerRef.current = null;
    }
    const layer = L.polyline([from, to], { weight: 5, dashArray: "6 8", opacity: 0.9 });
    routeLayerRef.current = layer.addTo(mapRef.current);
    mapRef.current.fitBounds(layer.getBounds(), { padding: [60, 60], maxZoom: 19 });
  };

  // Efecto que anuncia pasos cuando te acercas a trigger points
  useEffect(() => {
    if (!routeActive || !userLoc || !triggerPtsRef.current.length) return;
    const NEAR_M = 18;
    const idxAt = Math.min(Math.max(spokenStepIdxRef.current + 1, 0), triggerPtsRef.current.length - 1);
    const target = triggerPtsRef.current[idxAt];
    const d = L.latLng(userLoc.lat, userLoc.lng).distanceTo(target);

    if (d <= NEAR_M) {
      const now = Date.now();
      if (now - lastSpeakTsRef.current > 2500) {
        const announceIdx = Math.min(idxAt + 1, steps.length - 1);
        if (announceIdx >= 0 && announceIdx < steps.length) {
          speakAll([steps[announceIdx]]);
          lastSpeakTsRef.current = now;
          spokenStepIdxRef.current = announceIdx;
          setNextStepPointer(announceIdx + 1);
        }
      }
    }
  }, [userLoc, routeActive, steps]);

  // Limpieza rutas
  const clearRouteLayers = () => {
    if (!mapRef.current) return;
    if (routingRef.current) {
      try { mapRef.current.removeControl(routingRef.current); } catch {}
      routingRef.current = null;
    }
    if (routeLayerRef.current) {
      try { mapRef.current.removeLayer(routeLayerRef.current); } catch {}
      routeLayerRef.current = null;
    }
    if (buildingNoteRef.current) {
      try { mapRef.current.removeLayer(buildingNoteRef.current); } catch {}
      buildingNoteRef.current = null;
    }
    setSteps([]);
    setNextStepPointer(0);
    setRouteActive(false);
    setStepsOpen(false);
  };

  // Mostrar nota de indicaciones en el building (tooltip)
  const showBuildingDirectionsNote = () => {
    if (!mapRef.current || !selectedBuilding) return;
    if (buildingNoteRef.current) {
      try { mapRef.current.removeLayer(buildingNoteRef.current); } catch {}
      buildingNoteRef.current = null;
    }
    const text = selectedRoom?.directions?.trim();
    if (!text) return;
    const tt = L.tooltip({
      permanent: true,
      direction: "top",
      className: "building-directions",
      offset: [0, -12],
      opacity: 0.95,
    })
      .setLatLng([selectedBuilding.latitude, selectedBuilding.longitude])
      .setContent(`<b>Indicaciones:</b> ${text}`)
      .addTo(mapRef.current);
    buildingNoteRef.current = tt;
  };

  // Rooms agrupados por piso (memorizado)
  const roomsByFloor = useMemo(() => {
    const map = new Map<number, Room[]>();
    buildingRooms.forEach((r) => {
      const n = r.floor?.floor_number ?? 0;
      if (!map.has(n)) map.set(n, []);
      map.get(n)!.push(r);
    });
    return Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
  }, [buildingRooms]);

  // Reset UI
  const resetUI = () => {
    clearRouteLayers();
    if (routingRef.current && mapRef.current) {
      try { mapRef.current.removeControl(routingRef.current); } catch {}
      routingRef.current = null;
    }
    setSelectedRoom(null);
    setSelectedBuilding(null);
    setQuery("");
    routePathRef.current = null;
    triggerPtsRef.current = [];
    spokenStepIdxRef.current = -1;
    setNextStepPointer(0);
    setRoutePlaying(null);
    setRouteIdx(0);
    setCurrentStepRoom(null);
    setCurrentStepBuilding(null);
    setFirstRouteBuildingImage(null);
    prevStepBuildingIdRef.current = null;
    prevStepFloorNumberRef.current = null;
  };

  // ====== Búsqueda UI / handler ======
  const handleSearch = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const q = (query || "").trim();
    if (!q) return;

    // Rooms
    const rList = await findRooms(q);
    // Landmarks
    const lList = await findLandmarksMany(q);
    // Buildings
    const bList = findBuilding(q);

    const hits: Hit[] = [
      ...rList.map((r) => ({ kind: "room" as const, room: r, label: r.name })),
      ...lList.map((l) => ({ kind: "landmark" as const, landmark: l, label: l.name ?? l.type })),
      ...bList.map((b) => ({ kind: "building" as const, building: b, label: b.name })),
    ];

    if (hits.length === 0) {
      // probar como recorrido
      const asRoute = await fetchRouteByName(q);
      if (asRoute) {
        await startRouteByName(q);
        return;
      }
      toast.error("Sin resultados");
      return;
    }

    if (hits.length === 1) {
      const h = hits[0];
      if (h.kind === "room") await focusRoom(h.room);
      else if (h.kind === "landmark") await focusLandmark(h.landmark);
      else await handleSelectBuilding(h.building, true);
      return;
    }

    // Si hay varios resultados -> abrir modal scrolleable para selección
    setSearchHits(hits);
    setSearchModalOpen(true);
  };

  // Selección desde modal de búsquedas múltiples
  const handleSelectHit = async (hit: Hit) => {
    setSearchModalOpen(false);
    setTimeout(async () => {
      if (hit.kind === "room") await focusRoom(hit.room);
      else if (hit.kind === "landmark") await focusLandmark(hit.landmark);
      else await handleSelectBuilding(hit.building, true);
      setSearchHits([]);
      setQuery("");
    }, 120);
  };

  // ====== UI: render ======
  return (
    <div className="relative h-screen w-full bg-background">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-20 bg-primary text-primary-foreground border-b border-primary/30">
        <div className="max-w-6xl mx-auto px-3 md:px-4 h-12 flex items-center justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <div className="font-semibold text-sm sm:text-base leading-none">UNEMI Campus</div>
            {userLoc ? (
              <Badge variant="secondary" className="hidden sm:inline-flex">GPS activo</Badge>
            ) : gpsDenied ? (
              <Badge variant="destructive" className="hidden sm:inline-flex">GPS no disponible</Badge>
            ) : (
              <Badge className="hidden sm:inline-flex">Obteniendo GPS…</Badge>
            )}
          </div>

          <div className="flex items-center gap-2">
            {appUser ? (
              <>
                <Badge variant="outline" className="hidden sm:inline-flex">
                  <UserCircle2 className="w-4 h-4 mr-1" /> {appUser.usuario} · {appUser.role}
                </Badge>
                <Button size="sm" variant="secondary" onClick={doLogout}>
                  <LogOut className="w-4 h-4 mr-2" /> Salir
                </Button>
              </>
            ) : (
              <Button size="sm" onClick={() => setLoginOpen(true)}>
                <LogIn className="w-4 h-4 mr-2" /> Iniciar sesión
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Mapa */}
      <div className={`absolute inset-0 pt-12`}>
        <div ref={mapContainer} className="w-full h-full" />
      </div>

      {/* Tarjeta búsqueda */}
      {!routeActive && (
        <Card className="absolute top-16 left-4 right-4 md:left-6 md:right-auto md:w-[840px] z-[1200] p-3 shadow-xl border-border/60 bg-card/95 backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <div className="text-sm text-muted-foreground">
              Escribe tu destino y te llevo a la <b>entrada</b> más cercana o a la <b>referencia</b>.
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const center = mapRef.current?.getCenter();
                  const lat = userLoc?.lat ?? center?.lat;
                  const lng = userLoc?.lng ?? center?.lng;
                  const zoom = mapRef.current?.getZoom();
                  if (lat == null || lng == null) {
                    toast.error("No hay ubicación para compartir aún");
                    return;
                  }
                  const url = `${window.location.origin}${window.location.pathname}?lat=${lat.toFixed(6)}&lng=${lng.toFixed(6)}${zoom ? `&z=${zoom}` : ""}`;
                  navigator.clipboard?.writeText(url).then(() => toast.success("Enlace copiado"));
                }}
                title="Copiar enlace con mi ubicación o vista actual"
              >
                <MapPin className="w-4 h-4 mr-2" /> Compartir
              </Button>
            </div>
          </div>

          <form className="flex gap-2 items-end" onSubmit={(e) => { e.preventDefault(); handleSearch(); }} autoComplete="off">
            <div className="flex-1">
              <Label className="text-xs">¿A dónde quieres ir?</Label>
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder='Ej: "Aula 201", "Bloque CRAI", "plazoleta principal" o nombre de un recorrido'
              />
            </div>
            <Button type="button" onClick={() => handleSearch()}>
              <Search className="w-4 h-4 mr-2" /> Buscar
            </Button>
          </form>

          <div className="text-xs text-muted-foreground mt-2">
            Ingresa un aula, bloque, referencia o nombre de <b>recorrido</b>.
          </div>
        </Card>
      )}

      {/* Panel edificio */}
      {selectedBuilding && !routeActive && (
        <Card className="absolute bottom-4 left-4 right-4 md:left-6 md:right-auto md:w-[720px] z-[1200] p-4 shadow-xl border-border/60 bg-card/95 backdrop-blur">
          <div className="mb-2">
            <div className="text-lg font-semibold">{selectedBuilding.name}</div>
            {selectedRoom ? (
              <div className="text-sm text-muted-foreground">
                Destino: <b>{selectedRoom.name}</b>
                {selectedRoom.room_number ? ` · ${selectedRoom.room_number}` : ""}
                {selectedRoom.floor?.floor_number != null ? ` · Piso ${selectedRoom.floor?.floor_number}` : ""}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">Selecciona un espacio para ver detalles y ruta.</div>
            )}
          </div>

          {selectedRoom?.directions && (
            <div className="text-sm mb-3">
              <span className="font-medium">Indicaciones: </span>
              {selectedRoom.directions}
            </div>
          )}

          <div className="max-h-64 overflow-y-auto pr-1">
            {roomsByFloor.length === 0 ? (
              <div className="text-sm text-muted-foreground">Este edificio aún no tiene espacios registrados.</div>
            ) : (
              roomsByFloor.map(([floorNumber, rooms]) => (
                <div key={floorNumber} className="mb-3">
                  <div className="text-sm font-medium mb-1">Piso {floorNumber}</div>
                  <div className="grid grid-cols-1 gap-1.5">
                    {rooms.map((r) => (
                      <button
                        key={r.id}
                        onClick={() => focusRoom(r)}
                        className={`text-left px-2 py-1 rounded border hover:bg-accent hover:text-accent-foreground transition ${
                          selectedRoom?.id === r.id ? "bg-accent" : ""
                        }`}
                        title="Ver ruta a este espacio"
                      >
                        <div className="text-sm font-medium">
                          {r.name} {r.room_number ? `· ${r.room_number}` : ""}
                        </div>
                        {r.description && (
                          <div className="text-xs text-muted-foreground line-clamp-2">{r.description}</div>
                        )}
                        {r.actividades && r.actividades.length > 0 && (
                          <div className="text-[11px] text-muted-foreground mt-0.5">
                            Actividades: {r.actividades.join(", ")}
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="mt-3 flex flex-wrap gap-2 items-center">
            <Button
              variant="secondary"
              onClick={() => {
                if (!selectedBuilding) return;
                if (!userLoc) {
                  toast.error("Activa el GPS para trazar la ruta.");
                  return;
                }
                const from = L.latLng(userLoc.lat, userLoc.lng);
                const to = bestEntranceForBuilding(selectedBuilding.id, from);
                drawFootRoute(from, to, selectedRoom ?? undefined, selectedBuilding.name, selectedBuilding.image_url ?? null);
              }}
            >
              Trazar ruta a la ENTRADA
            </Button>

            <Button
              variant="outline"
              onClick={() => {
                setSelectedRoom(null);
                if (selectedBuilding && mapRef.current) {
                  mapRef.current.setView([selectedBuilding.latitude, selectedBuilding.longitude], 18, { animate: true });
                }
              }}
            >
              Centrar edificio
            </Button>
          </div>
        </Card>
      )}

      {/* Tarjeta imagen del primer edificio del recorrido (si existe) */}
      {firstRouteBuildingImage && (
        <div className="absolute top-14 right-3 z-[1200]">
          <div className="rounded-md border bg-card/90 backdrop-blur px-3 py-2 shadow max-w-xs">
            <div className="text-xs text-muted-foreground">Imagen inicio del recorrido</div>
            <div className="mt-2 w-40 h-24 rounded overflow-hidden border bg-muted">
              <img src={firstRouteBuildingImage} alt="Primer edificio" className="w-full h-full object-cover" />
            </div>
            <div className="mt-2 flex gap-2">
              <Button size="sm" onClick={() => setStepsOpen(true)}>Ver pasos</Button>
              <Button size="sm" variant="outline" onClick={() => {
                setFirstRouteBuildingImage(null);
              }}>Ocultar</Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Instrucciones */}
      <Dialog
        open={routeActive && stepsOpen && steps.length > 0}
        onOpenChange={(o) => {
          if (!o) {
            setStepsOpen(false);
            speakReset();
          }
        }}
      >
        <DialogPortal>
          <DialogOverlay className="fixed inset-0 z-[3000] bg-black/50 backdrop-blur-sm" />
          <DialogContent className="z-[3001] p-0 max-w-none w-[100vw] sm:w-[720px] h-[85vh] sm:h-auto sm:max-h-[88vh] overflow-hidden">
            <div className="flex flex-col h-full">
              <DialogHeader className="px-5 pt-4 relative">
                <DialogTitle>Instrucciones del recorrido</DialogTitle>
                <DialogDescription>
                  Sigue los pasos en orden. Si estás dentro del mismo edificio, te leeré la
                  instrucción personalizada.
                </DialogDescription>

                {/* Imagen superior derecha dentro del modal (si existe) */}
                <div className="absolute right-4 top-4">
                  {firstRouteBuildingImage ? (
                    <div className="w-28 h-16 rounded overflow-hidden border bg-muted">
                      <img src={firstRouteBuildingImage} alt="Edificio inicio" className="w-full h-full object-cover" />
                    </div>
                  ) : currentStepBuilding?.image_url ? (
                    <div className="w-28 h-16 rounded overflow-hidden border bg-muted">
                      <img src={currentStepBuilding.image_url} alt="Edificio" className="w-full h-full object-cover" />
                    </div>
                  ) : null}
                </div>
              </DialogHeader>

              <div className="px-5 pb-3 flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => speakAll(steps.slice(nextStepPointer))}>
                  ▶️ Leer
                </Button>
                <Button size="sm" variant="outline" onClick={speakPause}>
                  {ttsPlaying ? "⏸️ Pausar" : "⏯️ Reanudar"}
                </Button>
                <div className="flex-1" />
                {routePlaying && (
                  <Button size="sm" onClick={nextRouteStep}>
                    Siguiente paso
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => { setStepsOpen(false); speakReset(); }}>
                  <X className="w-4 h-4" />
                </Button>
              </div>

              {/* Lista de pasos (scroll interno) */}
              {steps.length > 0 && (
                <div className="px-5 pb-2 overflow-auto" style={{ maxHeight: "48vh" }}>
                  <ol className="list-decimal pl-5 space-y-2 text-sm">
                    {steps.slice(nextStepPointer).map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ol>
                </div>
              )}

              {/* Imagen contextual (imagen del room o edificio) */}
              <div className="px-5 pb-5 overflow-auto" style={{ maxHeight: "24vh" }}>
                {currentStepRoom?.image_url ? (
                  <>
                    <div className="text-sm text-muted-foreground mb-2">Imagen del espacio</div>
                    <div className="rounded-lg border bg-muted/40 p-2">
                      <img
                        src={currentStepRoom.image_url}
                        alt="Espacio"
                        className="w-full max-h-[520px] object-contain rounded-md"
                        loading="eager"
                      />
                    </div>
                  </>
                ) : currentStepBuilding?.image_url ? (
                  <>
                    <div className="text-sm text-muted-foreground mb-2">Imagen del edificio</div>
                    <div className="rounded-lg border bg-muted/40 p-2">
                      <img
                        src={currentStepBuilding.image_url}
                        alt="Edificio"
                        className="w-full max-h-[520px] object-contain rounded-md"
                        loading="eager"
                      />
                    </div>
                  </>
                ) : null}
              </div>
            </div>
          </DialogContent>
        </DialogPortal>
      </Dialog>

      {/* Modal de resultados de búsqueda (scrolleable) */}
      <Dialog open={searchModalOpen} onOpenChange={setSearchModalOpen}>
        <DialogPortal>
          <DialogOverlay className="fixed inset-0 z-[3000] bg-black/40" />
          <DialogContent className="z-[3001] max-w-lg mx-4 sm:mx-auto w-[min(720px,90vw)] max-h-[80vh] overflow-hidden">
            <div className="flex flex-col h-full">
              <DialogHeader className="px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <DialogTitle>Selecciona un resultado</DialogTitle>
                    <DialogDescription className="text-sm text-muted-foreground">
                      La búsqueda devolvió varios resultados. Elige a cuál deseas ir.
                    </DialogDescription>
                  </div>
                  <div>
                    <Button variant="ghost" size="sm" onClick={() => setSearchModalOpen(false)}>
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </DialogHeader>

              <div className="px-4 pb-4 overflow-auto" style={{ maxHeight: "64vh" }}>
                {searchHits.length === 0 ? (
                  <div className="text-sm text-muted-foreground">No hay resultados para mostrar.</div>
                ) : (
                  <ul className="space-y-2">
                    {searchHits.map((h, idx) => (
                      <li key={idx}>
                        <button
                          onClick={() => handleSelectHit(h)}
                          className="w-full text-left p-3 rounded border hover:bg-accent/10 transition flex items-center gap-3"
                        >
                          <div className="flex-1">
                            <div className="font-medium">
                              {h.kind === "room" ? `${h.room.name}${h.room.room_number ? ` · ${h.room.room_number}` : ""}` :
                                h.kind === "building" ? h.building.name :
                                h.kind === "landmark" ? (h.landmark.name ?? h.landmark.type) : ""}
                            </div>
                            <div className="text-xs text-muted-foreground mt-0.5">
                              {h.kind === "room" ? `Aula / Espacio — Piso ${h.room.floor?.floor_number ?? "?"}` :
                                h.kind === "building" ? "Edificio" :
                                h.kind === "landmark" ? `Referencia (${h.landmark.type})` : ""}
                            </div>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Seleccionar
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </DialogContent>
        </DialogPortal>
      </Dialog>

      {/* Botones flotantes */}
      {routeActive && steps.length > 0 && !stepsOpen && (
        <div className="absolute bottom-4 right-4 z-[1200]">
          <Button size="lg" onClick={() => setStepsOpen(true)}>
            Ver pasos
          </Button>
        </div>
      )}

      {routeActive && (
        <div className="absolute bottom-4 left-4 z-[1200]">
          <Button size="lg" variant="secondary" onClick={resetUI}>
            <PanelTopOpen className="w-5 h-5 mr-2" /> Nueva consulta
          </Button>
        </div>
      )}

      {/* Modal Login */}
      <Dialog open={loginOpen} onOpenChange={setLoginOpen}>
        <DialogContent className="sm:max-w-md max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>Iniciar sesión</DialogTitle>
            <DialogDescription>Accede para ver destinos según tu rol.</DialogDescription>
          </DialogHeader>

          <form onSubmit={doLogin} className="space-y-3">
            <div>
              <Label>Usuario</Label>
              <Input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
            </div>
            <div>
              <Label>Contraseña</Label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            {authError && <div className="text-sm text-red-500">{authError}</div>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setLoginOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={authLoading}>{authLoading ? "Ingresando..." : "Entrar"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
