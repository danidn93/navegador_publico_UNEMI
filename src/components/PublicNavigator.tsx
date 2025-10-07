// src/components/PublicNavigator.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet-routing-machine/dist/leaflet-routing-machine.css";
import {
  DialogPortal, DialogOverlay
} from "@/components/ui/dialog";

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
} from "@/components/ui/dialog";
import { Search, Send, PanelTopOpen, X, MapPin } from "lucide-react";

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

// ======== Utils de normalización para búsquedas robustas ========
const norm = (s: string) =>
  (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

// Divide la consulta en tokens útiles (2+ chars), sin tildes ni símbolos
const tokenize = (s: string) =>
  norm(s)
    .split(/\s+/)
    .map(t => t.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter(t => t.length >= 2);

// ¿El texto contiene TODOS los tokens (parciales)?
const matchAllTokens = (haystack: string, tokens: string[]) => {
  const H = norm(haystack);
  return tokens.every(t => H.includes(t));
};

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
};

const UNEMI_CENTER: [number, number] = [-2.14898719, -79.60420553];

const CATEGORY_WORDS = [
  "bloque",
  "aula",
  "laboratorio",
  "taller",
  "oficina",
  "facultad",
  "departamento",
  "referencia",
  "plazoleta",
  "bar",
  "corredor",
];

type ChatMsg = { role: "assistant" | "user"; text: string };

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
    G2.set(id, { id, lat: n.lat, lng: n.lng, edges: n.edges.map(e => ({ ...e })) });
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
    if (!n.edges.some(e => e.to === to)) n.edges.push({ to, w });
  };
  const dQA = proj.Q.distanceTo(seg.a);
  const dQB = proj.Q.distanceTo(seg.b);
  add(Qid, seg.aId, dQA); add(seg.aId, Qid, dQA);
  add(Qid, seg.bId, dQB); add(seg.bId, Qid, dQB);
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
      if (dir) { steps.push(`En ${Math.round(distAcc)} m, gira a la ${dir}.`); distAcc = 0; }
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

// ---- COMPARTIR UBICACIÓN ----
function buildShareUrl(lat: number, lng: number, zoom?: number) {
  const base = `${window.location.origin}${window.location.pathname}`;
  const z = zoom != null ? `&z=${zoom}` : "";
  return `${base}?lat=${lat.toFixed(6)}&lng=${lng.toFixed(6)}${z}`;
}
async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success("Enlace copiado al portapapeles");
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    toast.success("Enlace copiado");
  }
}

/** === Tipos/estado para resultados múltiples === */
type SearchHit =
  | { kind: "room"; room: Room; label: string; sub?: string }
  | { kind: "building"; building: Building; label: string; sub?: string }
  | { kind: "landmark"; landmark: Landmark; label: string; sub?: string };

export default function PublicNavigator() {
  // ======= Estado base
  const [query, setQuery] = useState("");
  const [userLoc, setUserLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsDenied, setGpsDenied] = useState(false);

  // Seguir GPS activo por defecto
  const gpsFollow = true;

  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setIsAdmin(!!data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setIsAdmin(!!s));
    return () => sub.subscription?.unsubscribe?.();
  }, []);

  const [buildings, setBuildings] = useState<Building[]>([]);
  const [selectedBuilding, setSelectedBuilding] = useState<Building | null>(null);
  const [buildingFloors, setBuildingFloors] = useState<Floor[]>([]);
  const [buildingRooms, setBuildingRooms] = useState<Room[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);

  const [footways, setFootways] = useState<Footway[]>([]);
  const [entrances, setEntrances] = useState<Entrance[]>([]);
  const [landmarks, setLandmarks] = useState<Landmark[]>([]);

  const graphRef = useRef<Map<NodeId, Node> | null>(null);
  const segmentsRef = useRef<Segment[] | null>(null);

  // Punto compartido (si llega en la URL ?lat&lng)
  const [sharedTarget, setSharedTarget] = useState<L.LatLng | null>(null);

  // Mapa
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.Marker[]>([]);
  const routingRef = useRef<any>(null);
  const userMarkerRef = useRef<L.Marker | null>(null);
  const buildingNoteRef = useRef<L.Tooltip | null>(null);

  const routeLayerRef = useRef<L.Layer | null>(null);

  const walkerRef = useRef<L.Marker | null>(null);
  const walkerIcon = L.icon({
    iconUrl: "/mascota-unemi.png",
    iconSize: [72, 72],
    iconAnchor: [36, 60],
    tooltipAnchor: [0, -60],
  });

  // Guía
  const [steps, setSteps] = useState<string[]>([]);
  const [ttsPlaying, setTtsPlaying] = useState(false);

  // NUEVO: índice del siguiente paso (para que el modal muestre “lo que viene”)
  const [nextStepPointer, setNextStepPointer] = useState(0);

  // Navegación responsiva
  const [routeActive, setRouteActive] = useState(false);
  const [stepsOpen, setStepsOpen] = useState(false);

  // Chat
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMsgs, setChatMsgs] = useState<ChatMsg[]>([
    { role: "assistant", text: "Hola 👋 ¿A qué edificio, espacio o referencia quieres ir? (Ej: “Bloque R”, “Dirección de TICs” o “plazoleta central”)." },
  ]);
  const [chatInput, setChatInput] = useState("");
  const chatInputRef = useRef<HTMLInputElement | null>(null);

  // Resultados múltiples
  const [resultsOpen, setResultsOpen] = useState(false);
  const [resultHits, setResultHits] = useState<SearchHit[]>([]);

  useEffect(() => {
    if (chatOpen) {
      const t = setTimeout(() => chatInputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [chatOpen]);

  // Atajo para abrir chat rápido
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/") { e.preventDefault(); setChatOpen(true); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ====== INIT: GPS + datos
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
      const { data, error } = await supabase
        .from("buildings")
        .select("id,name,description,latitude,longitude,total_floors,building_code,state")
        .eq("state", "HABILITADO")
        .order("name", { ascending: true });
      if (error) toast.error("Error cargando edificios");
      else setBuildings((data || []) as Building[]);
    })();

    (async () => {
      const { data, error } = await supabase
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
      const { data, error } = await supabase
        .from("entrances")
        .select("id,building_id,name,type,location");
      if (error) toast.error("No se pudieron cargar las entradas");
      else setEntrances((data || []) as Entrance[]);
    })();

    (async () => {
      const { data, error } = await supabase
        .from("landmarks")
        .select("id,name,type,location");
      if (error) toast.error("No se pudieron cargar las referencias");
      else setLandmarks((data || []) as Landmark[]);
    })();
  }, []);

  // ====== MAP ======
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    const map = L.map(mapContainer.current, {
      zoomControl: true,
      attributionControl: true,
    }).setView(UNEMI_CENTER, 17);
    mapRef.current = map;

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors",
      maxZoom: 20,
    }).addTo(map);

    addBuildingMarkers();

    return () => {
      if (!mapRef.current) return;
      markersRef.current.forEach((m) => mapRef.current?.removeLayer(m));
      if (routingRef.current) mapRef.current.removeControl(routingRef.current);
      if (buildingNoteRef.current) mapRef.current.removeLayer(buildingNoteRef.current);
      if (routeLayerRef.current) { mapRef.current.removeLayer(routeLayerRef.current); routeLayerRef.current = null; }
      if (walkerRef.current) mapRef.current.removeLayer(walkerRef.current);
      if (userMarkerRef.current) mapRef.current.removeLayer(userMarkerRef.current);
      mapRef.current.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Iniciar vista si vienen lat/lng en la URL compartida (y guardar el punto)
  useEffect(() => {
    if (!mapRef.current) return;
    try {
      const sp = new URLSearchParams(window.location.search);
      const lat = parseFloat(sp.get("lat") || "");
      const lng = parseFloat(sp.get("lng") || "");
      const z = parseInt(sp.get("z") || "", 10);
      if (!isNaN(lat) && !isNaN(lng)) {
        const pt = L.latLng(lat, lng);
        setSharedTarget(pt);
        mapRef.current.setView(pt, !isNaN(z) ? z : 18, { animate: true });
        const m = L.marker(pt, { title: "Punto compartido" }).addTo(mapRef.current);
        m.bindPopup("<b>Punto compartido</b>").openPopup();
      }
    } catch {}
  }, [mapRef.current]);

  useEffect(() => { addBuildingMarkers(); }, [buildings]); // eslint-disable-line

  // marcador de usuario y mascota (siempre sigue el GPS)
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
          icon: walkerIcon, zIndexOffset: 1000,
        })
          .addTo(mapRef.current)
          .bindTooltip("¡Sígueme! 🐯", { permanent: false, direction: "top", offset: [0, -36] });
      } else {
        walkerRef.current.setLatLng([userLoc.lat, userLoc.lng]);
      }
    }
  }, [userLoc, gpsFollow]);

  const addBuildingMarkers = () => {
    if (!mapRef.current) return;
    markersRef.current.forEach((m) => mapRef.current?.removeLayer(m));
    markersRef.current = [];

    buildings.forEach((b) => {
      const customIcon = L.divIcon({
        className: "custom-building-marker",
        html: `<div class="bg-primary text-primary-foreground rounded-full w-8 h-8 flex items-center justify-center text-sm font-bold shadow-lg border-2 border-background">${b.total_floors}</div>`,
        iconSize: [32, 32], iconAnchor: [16, 16],
      });

      const marker = L.marker([b.latitude, b.longitude], { icon: customIcon, title: b.name })
        .addTo(mapRef.current!);
      marker.on("click", () => handleSelectBuilding(b, true));
      markersRef.current.push(marker);
    });
  };

  // ====== Búsqueda
  const parseIntent = (raw: string) => {
    const s = norm(raw);
    const re = /como\s+llego\s+(?:al|a\s+la)\s+(bloque|aula|laboratorio|taller|oficina|facultad|departamento|referencia|plazoleta|bar|corredor)\s+(.+)/i;
    const m = s.match(re);
    if (m) return { category: m[1], term: m[2].trim() };
    for (const cat of CATEGORY_WORDS) {
      const i = s.indexOf(cat + " ");
      if (i >= 0) return { category: cat, term: s.slice(i + cat.length).trim() };
    }
    return { category: null as string | null, term: s };
  };

  // ==== Buildings: coincidencias parciales por tokens (name/building_code), insensible a tildes ====
  const findBuilding = (termRaw: string): Building[] => {
    let t = norm(termRaw).replace(/^bloque\s+/, ""); // permite “bloque crai” -> “crai”
    const tokens = tokenize(t);

    // Candidatos: contienen TODOS los tokens
    const cands = buildings.filter((b) => {
      const label = `${b.name} ${b.building_code ?? ""}`;
      return matchAllTokens(label, tokens);
    });

    // Si nada, relaja: cualquiera que contenga al menos un token
    if (cands.length === 0) {
      return buildings.filter((b) => {
        const label = `${b.name} ${b.building_code ?? ""}`;
        const H = norm(label);
        return tokens.some(tok => H.includes(tok));
      });
    }
    return cands;
  };

  // ==== Rooms: OR amplio en SQL + filtro por tokens en cliente (name, room_number, keywords[], actividades[]) ====
  const findRooms = async (termRaw: string, category: string | null): Promise<Room[]> => {
    const raw = termRaw.trim();
    const tokens = tokenize(raw);

    const kwArray = `{${tokens.join(",")}}`;

    const orParts: string[] = [
      `name.ilike.%${raw}%`,
      `room_number.ilike.%${raw}%`,
    ];

    // tokens parciales en name/room_number
    tokens.forEach(tok => {
      orParts.push(`name.ilike.%${tok}%`);
      orParts.push(`room_number.ilike.%${tok}%`);
    });

    // arrays por overlaps
    if (tokens.length > 0) {
      orParts.push(`keywords.ov.${kwArray}`);
      orParts.push(`actividades.ov.${kwArray}`);
    }

    const { data, error } = await supabase
      .from("rooms")
      .select(
        "id,floor_id,name,room_number,description,directions,room_type_id,capacity,equipment,keywords,actividades"
      )
      .or(orParts.join(","))
      .limit(200);

    if (error) { console.error(error); toast.error("Error buscando espacios"); return []; }

    // Filtro final: exigir TODOS los tokens en algún campo consolidado
    const filtered = (data || []).filter((r: any) => {
      const bag = [
        r.name ?? "",
        r.room_number ?? "",
        r.description ?? "",
        ...(r.keywords ?? []),
        ...(r.actividades ?? []),
      ].join(" ");
      return matchAllTokens(bag, tokens);
    }) as Room[];

    // Priorización por categoría (si aplica)
    if (category && !["bloque","referencia","plazoleta","bar","corredor"].includes(category)) {
      const cat = norm(category);
      filtered.sort((a, b) => {
        const aHit = norm(`${a.name} ${a.room_number ?? ""}`).includes(cat) ? 1 : 0;
        const bHit = norm(`${b.name} ${b.room_number ?? ""}`).includes(cat) ? 1 : 0;
        return bHit - aHit;
      });
    }

    return filtered;
  };

  // ==== Landmarks: traer lote y filtrar por tokens (name/type) sin tildes ====
  const findLandmarksMany = async (termRaw: string): Promise<Landmark[]> => {
    const tokens = tokenize(termRaw);

    const { data, error } = await supabase
      .from("landmarks")
      .select("id,name,type,location")
      .limit(200);

    if (error) { console.error(error); return []; }

    const list = (data || []) as Landmark[];
    return list.filter(lm => {
      const label = `${lm.name ?? ""} ${lm.type}`;
      return matchAllTokens(label, tokens);
    });
  };

  // ======= Búsqueda unificada con lista de resultados =======
  const handleSearch = async (e?: React.FormEvent, custom?: string) => {
    e?.preventDefault();
    const q = (custom ?? query).trim();
    if (!q) return;

    const { category, term } = parseIntent(q);

    // 1) Buildings
    const bList = (!category || category === "bloque") ? findBuilding(term) : [];

    // 2) Rooms
    const rList = await findRooms(
      term,
      category && !["bloque","referencia","plazoleta","bar","corredor"].includes(category) ? category : null
    );

    // 3) Landmarks
    const lList = await findLandmarksMany(term);

    const hits: SearchHit[] = [
      ...bList.map(b => ({ kind: "building", building: b, label: b.name } as SearchHit)),
      ...rList.map(r => ({
        kind: "room",
        room: r,
        label: `${r.name}${r.room_number ? ` · ${r.room_number}` : ""}`,
        sub: r.description || undefined,
      }) as SearchHit),
      ...lList.map(l => ({ kind: "landmark", landmark: l, label: l.name ?? l.type } as SearchHit)),
    ];

    if (hits.length === 0) {
      toast.error("Sin resultados");
      pushAssistant("No encontré resultados. Prueba “Bloque CRAI”, “Aula 201”, “Dirección de TICs” o “plazoleta central”.");
      return;
    }

    if (hits.length === 1) {
      await resolveHit(hits[0]);
      return;
    }

    // varios resultados → mostrar diálogo
    setResultHits(hits);
    setResultsOpen(true);
  };

  // Resolver un resultado elegido
  const resolveHit = async (hit: SearchHit) => {
    setResultsOpen(false);
    if (hit.kind === "building") {
      await handleSelectBuilding(hit.building, true);
      pushAssistant(`Te llevo al bloque: ${hit.building.name}.`);
      return;
    }
    if (hit.kind === "landmark") {
      await focusLandmark(hit.landmark);
      pushAssistant(`Perfecto, te llevo a: ${hit.label}.`);
      return;
    }
    if (hit.kind === "room") {
      await focusRoom(hit.room);
      pushAssistant(`Listo, te muestro la ruta hacia: ${hit.label}.`);
      return;
    }
  };

  // ====== Select building / rooms
  const handleSelectBuilding = async (b: Building, fit = false) => {
    setSelectedBuilding(b); setSelectedRoom(null);

    if (mapRef.current && fit) {
      mapRef.current.setView([b.latitude, b.longitude], 18, { animate: true });
      L.popup().setLatLng([b.latitude, b.longitude]).setContent(`<b>${b.name}</b>`).openOn(mapRef.current);
    }
    await loadFloorsAndRooms(b.id);
  };

  const loadFloorsAndRooms = async (buildingId: string) => {
    try {
      const { data: floors, error: floorsErr } = await supabase
        .from("floors")
        .select("id,building_id,floor_number,floor_name")
        .eq("building_id", buildingId)
        .order("floor_number", { ascending: true });
      if (floorsErr) throw floorsErr;
      setBuildingFloors((floors || []) as Floor[]);

      const floorIds = (floors || []).map((f) => f.id);
      if (floorIds.length === 0) { setBuildingRooms([]); return; }

      const { data: rooms, error: roomsErr } = await supabase
        .from("rooms")
        .select("id,floor_id,name,room_number,description,directions,room_type_id,capacity,equipment,keywords,actividades")
        .in("floor_id", floorIds)
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
    } catch (e) { console.error(e); toast.error("Error cargando pisos/rooms"); }
  };

  // ====== Grafo Footways
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

        G.set(id1, a); G.set(id2, b);
        segs.push({ a: L.latLng(lat1, lng1), b: L.latLng(lat2, lng2), aId: id1, bId: id2 });
      }
    }
    return { G, segs };
  };

  const ensureGraphWithSegments = () => {
    if (!graphRef.current || !segmentsRef.current) {
      const { G, segs } = buildGraphAndSegments(footways);
      graphRef.current = G; segmentsRef.current = segs;
    }
    return { G: graphRef.current!, segments: graphRef.current ? segmentsRef.current! : [] };
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
      for (const id of open) { const curF = f.get(id) ?? Infinity; if (curF < bestF) { bestF = curF; best = id; } }
      if (best) open.delete(best); return best;
    };
    while (open.size) {
      const cur = pop()!; if (cur === goal) {
        const path: NodeId[] = [cur]; while (came.has(path[0])) path.unshift(came.get(path[0])!); return path;
      }
      const curG = g.get(cur) ?? Infinity;
      for (const e of G.get(cur)!.edges) {
        const ng = curG + e.w;
        if (ng < (g.get(e.to) ?? Infinity)) { came.set(e.to, cur); g.set(e.to, ng); f.set(e.to, ng + h(e.to, goal)); open.add(e.to); }
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
    const projTo   = nearestProjection(toLL, segments);
    if (projFrom.dist > SNAP_MAX || projTo.dist > SNAP_MAX) return null;

    const G = cloneGraph(baseG);
    const fromId = integrateProjection(G, segments, projFrom);
    const toId   = integrateProjection(G, segments, projTo);

    const ids = astar(G, fromId, toId);
    if (!ids) return null;

    return ids.map(id => {
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

  const clearRouteLayers = () => {
    if (!mapRef.current) return;
    if (routingRef.current) {
      mapRef.current.removeControl(routingRef.current);
      routingRef.current = null;
    }
    if (routeLayerRef.current) {
      mapRef.current.removeLayer(routeLayerRef.current);
      routeLayerRef.current = null;
    }
    if (buildingNoteRef.current) {
      mapRef.current.removeLayer(buildingNoteRef.current);
      buildingNoteRef.current = null;
    }
    setSteps([]); // limpia guía
    setTurnTriggers([]); // reset disparadores
    setNextStepPointer(0); // reset puntero
    setRouteActive(false);
    setStepsOpen(false);
  };

  const focusRoom = async (room: Room) => {
    try {
      const { data: floor, error: fErr } = await supabase
        .from("floors")
        .select("id,building_id,floor_number")
        .eq("id", room.floor_id)
        .single();
      if (fErr) throw fErr;

      const { data: building, error: bErr } = await supabase
        .from("buildings")
        .select("id,name,description,latitude,longitude,total_floors,building_code,state")
        .eq("id", floor.building_id)
        .eq("state", "HABILITADO")
        .single();
      if (bErr || !building) { toast.error("El edificio no está habilitado."); return; }

      await handleSelectBuilding(building as Building, true);

      const roomWithFloor: Room = {
        ...room,
        floor: { id: floor.id, floor_number: (floor as any).floor_number }
      };
      setSelectedRoom(roomWithFloor);

      if (!userLoc) {
        toast.error("Activa el GPS para trazar la ruta a la entrada.");
        return;
      }
      const from = L.latLng(userLoc.lat, userLoc.lng);
      const to = bestEntranceForBuilding((building as Building).id, from);
      await drawFootRoute(from, to, roomWithFloor);
    } catch (e) { console.error(e); toast.error("No se pudo focalizar el espacio"); }
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

  const ensureRoutingLib = async () => {
    if ((L as any).Routing?.control) return;
    await import("leaflet-routing-machine");
  };

  // Anexa información de piso/directions al final de pasos
  const appendRoomInfoToSteps = (base: string[], room?: Room) => {
    const out = [...base];
    if (room?.floor?.floor_number != null) {
      out.push(`El destino está en el piso ${room.floor.floor_number}.`);
    }
    const d = (room?.directions || "").trim();
    if (d) out.push(`Indicaciones adicionales: ${d}`);
    return out;
  };

  // ===== NUEVO: Turn triggers para anunciar el siguiente paso por voz =====
  const [turnTriggers, setTurnTriggers] = useState<
    { lat: number; lng: number; stepIndex: number; fired: boolean }[]
  >([]);

  function computeTurnTriggers(path: L.LatLng[], stepsText: string[]) {
    const triggers: { lat: number; lng: number; stepIndex: number; fired: boolean }[] = [];
    // correlaciona cada giro geométrico con un índice de paso
    // (solo los pasos de giro y tramos, no los anexados de piso/directions)
    let stepIdx = 0;
    for (let i = 1; i < path.length - 1; i++) {
      const dir = turnDirection(path[i - 1], path[i], path[i + 1]);
      if (dir) {
        if (stepIdx < stepsText.length) {
          triggers.push({ lat: path[i].lat, lng: path[i].lng, stepIndex: stepIdx, fired: false });
        }
        stepIdx++;
      }
    }
    // el último “Continúa … hasta la entrada” probablemente quede como paso sin trigger de giro
    return triggers;
  }

  // ===== drawFootRoute (construye pasos + triggers + resetea puntero) =====
  const drawFootRoute = async (fromLL: L.LatLng, toLL: L.LatLng, roomInfo?: Room) => {
    if (!mapRef.current) return;

    clearRouteLayers();

    const ready = await waitForGraphReady();
    setRouteActive(true);
    setStepsOpen(false);
    setNextStepPointer(0);

    try {
      await ensureRoutingLib();

      if (ready) {
        const campusPath = routeOnCampus(fromLL, toLL);
        if (campusPath && campusPath.length >= 2) {
          const layer = L.polyline(campusPath, { weight: 5, opacity: 0.95 });
          routeLayerRef.current = layer.addTo(mapRef.current!);
          mapRef.current!.fitBounds(layer.getBounds(), { padding: [60, 60] });
          const insts = buildTurnByTurn(campusPath, toLL);
          const finalInsts = appendRoomInfoToSteps(insts, roomInfo);
          setSteps(finalInsts);

          // triggers y puntero
          setTurnTriggers(computeTurnTriggers(campusPath, finalInsts));
          setNextStepPointer(0);

          speakReset();
          return;
        }
      }

      const plan = (L as any).Routing.plan([fromLL, toLL], {
        draggableWaypoints: false, addWaypoints: false,
        createMarker: (i: number, wp: any) =>
          L.marker(wp.latLng, { title: i === 0 ? "Origen (a pie)" : "Destino" }),
      });

      const ctrl = (L as any).Routing.control({
        plan,
        router: (L as any).Routing.osrmv1({
          serviceUrl: "https://router.project-osrm.org/route/v1",
          profile: "foot", timeout: 12000, steps: true, annotations: true,
        }),
        fitSelectedRoutes: true, routeWhileDragging: false, showAlternatives: false, show: false,
      }).addTo(mapRef.current!);
      routingRef.current = ctrl;

      ctrl.on("routesfound", (e: any) => {
        const route = e.routes?.[0];
        const coords: L.LatLng[] = (route?.coordinates || []).map((c: any) => L.latLng(c.lat, c.lng));
        const insts = route?.instructions?.map((i: any) => i.text) ?? buildTurnByTurn(coords, toLL);
        const finalInsts = appendRoomInfoToSteps(insts, roomInfo);
        setSteps(finalInsts);

        setTurnTriggers(computeTurnTriggers(coords, finalInsts));
        setNextStepPointer(0);

        speakReset();
      });

      ctrl.on("routingerror", () => {
        toast.message("No se pudo obtener ruta peatonal, dibujo una guía directa.");
        drawFallbackLine(fromLL, toLL);
        let insts = [`Camina en línea recta hacia el destino (≈ ${Math.round(haversine(fromLL, toLL))} m).`];
        insts = appendRoomInfoToSteps(insts, roomInfo);
        setSteps(insts);
        setTurnTriggers([]); // sin triggers
        setNextStepPointer(0);
        speakReset();
      });
    } catch (e) {
      console.error(e);
      toast.error("No se pudo trazar la ruta. Te muestro una guía directa.");
      drawFallbackLine(fromLL, toLL);
      let insts = [`Camina en línea recta hacia el destino (≈ ${Math.round(haversine(fromLL, toLL))} m).`];
      insts = appendRoomInfoToSteps(insts, roomInfo);
      setSteps(insts);
      setTurnTriggers([]);
      setNextStepPointer(0);
      speakReset();
    }
  };

  const drawFallbackLine = (from: L.LatLng, to: L.LatLng) => {
    if (!mapRef.current) return;
    if (routeLayerRef.current) { mapRef.current.removeLayer(routeLayerRef.current); routeLayerRef.current = null; }
    const layer = L.polyline([from, to], { weight: 5, dashArray: "6 8", opacity: 0.9 });
    routeLayerRef.current = layer.addTo(mapRef.current);
    mapRef.current.fitBounds(layer.getBounds(), { padding: [60, 60] });
  };

  const showBuildingDirectionsNote = () => {
    if (!mapRef.current || !selectedBuilding) return;
    if (buildingNoteRef.current) { mapRef.current.removeLayer(buildingNoteRef.current); buildingNoteRef.current = null; }
    const text = selectedRoom?.directions?.trim();
    if (!text) return;
    const tt = L.tooltip({ permanent: true, direction: "top", className: "building-directions", offset: [0, -12], opacity: 0.95 })
      .setLatLng([selectedBuilding.latitude, selectedBuilding.longitude])
      .setContent(`<b>Indicaciones:</b> ${text}`)
      .addTo(mapRef.current);
    buildingNoteRef.current = tt;
  };

  // ======= TTS =======
  const speakAll = (texts: string[]) => {
    if (!("speechSynthesis" in window)) { toast("Tu navegador no soporta voz."); return; }
    const u = new SpeechSynthesisUtterance(texts.join(". "));
    u.lang = "es-ES"; u.rate = 1; u.onend = () => setTtsPlaying(false);
    window.speechSynthesis.cancel(); window.speechSynthesis.speak(u); setTtsPlaying(true);
  };
  const speakOne = (text: string) => {
    if (!("speechSynthesis" in window)) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "es-ES"; u.rate = 1; u.onend = () => setTtsPlaying(false);
    window.speechSynthesis.cancel(); window.speechSynthesis.speak(u); setTtsPlaying(true);
  };
  const speakPause = () => {
    if (!("speechSynthesis" in window)) return;
    if (window.speechSynthesis.speaking && !window.speechSynthesis.paused) { window.speechSynthesis.pause(); setTtsPlaying(false); }
    else if (window.speechSynthesis.paused) { window.speechSynthesis.resume(); setTtsPlaying(true); }
  };
  const speakReset = () => { if (!("speechSynthesis" in window)) return; window.speechSynthesis.cancel(); setTtsPlaying(false); };

  // ======= TTS automático del siguiente paso al acercarse a una intersección =======
  useEffect(() => {
    if (!routeActive || !userLoc || steps.length === 0) return;
    if (turnTriggers.length === 0) {
      // No hay giros detectados; si falta poco para terminar, puedes optar por anunciar el final.
      return;
    }
    const here = L.latLng(userLoc.lat, userLoc.lng);
    const PROXIMITY_M = 25;

    const nextTrig = turnTriggers.find(t => !t.fired);
    if (!nextTrig) return;

    const d = here.distanceTo([nextTrig.lat, nextTrig.lng]);
    if (d <= PROXIMITY_M) {
      // Anuncia SOLO el paso correspondiente a este trigger
      const sayIdx = Math.min(nextTrig.stepIndex, steps.length - 1);
      speakOne(steps[sayIdx]);
      // Marca disparado y avanza el puntero a lo que sigue
      setTurnTriggers(prev => prev.map(t => (t === nextTrig ? { ...t, fired: true } : t)));
      setNextStepPointer(Math.min(sayIdx + 1, steps.length - 1));
      // No abrimos modal; solo voz
    }
  }, [userLoc, routeActive, steps, turnTriggers]);

  // Chat helpers
  const pushAssistant = (text: string) => setChatMsgs((p) => [...p, { role: "assistant", text }]);
  const pushUser = (text: string) => setChatMsgs((p) => [...p, { role: "user", text }]);

  const onChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const msg = chatInput.trim();
    if (!msg) return;
    pushUser(msg);
    setChatInput("");
    await handleSearch(undefined, msg);
  };

  // Rooms agrupados
  const roomsByFloor = useMemo(() => {
    const map = new Map<number, Room[]>();
    buildingRooms.forEach((r) => {
      const n = r.floor?.floor_number ?? 0;
      if (!map.has(n)) map.set(n, []);
      map.get(n)!.push(r);
    });
    return Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
  }, [buildingRooms]);

  // reset rápido
  const resetUI = () => {
    clearRouteLayers();
    setSelectedRoom(null);
    setSelectedBuilding(null);
    setQuery("");
    setChatOpen(false);
  };

  // ================= UI =================
  return (
    <div className="relative h-screen w-full bg-background">
      {/* Header (NavBar) */}
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

          {/* Acciones derecha */}
          <div className="flex items-center gap-2" />
        </div>
      </div>

      {/* Mapa */}
      <div className={`absolute inset-0 ${routeActive ? "pt-10" : "pt-12"}`}>
        <div ref={mapContainer} className="w-full h-full" />
      </div>

      {/* Tarjeta superior de búsqueda: OCULTA cuando hay ruta */}
      {!routeActive && (
        <Card className="absolute top-16 left-4 right-4 md:left-6 md:right-auto md:w-[840px] z-[1200] p-3 shadow-xl border-border/60 bg-card/95 backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <div className="text-sm text-muted-foreground">
              Escribe tu destino y te llevo a la <b>entrada</b> más cercana o a la <b>referencia</b>. También puedes pegar un enlace compartido con <code>?lat=…&lng=…</code>.
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
                  if (lat == null || lng == null) { toast.error("No hay ubicación para compartir aún"); return; }
                  const url = buildShareUrl(lat, lng, zoom);
                  copyToClipboard(url);
                }}
                title="Copiar enlace con mi ubicación o vista actual"
              >
                <MapPin className="w-4 h-4 mr-2" /> Compartir
              </Button>
            </div>
          </div>

          <form className="flex gap-2 items-end" onSubmit={(e) => handleSearch(e)} autoComplete="off">
            <div className="flex-1">
              <Label className="text-xs">¿A dónde quieres ir?</Label>
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder='Ej: "Bloque CRAI", "Dirección de TICs", "Aula 201" o "plazoleta central"'
              />
            </div>
            <Button type="submit">
              <Search className="w-4 h-4 mr-2" /> Buscar
            </Button>
          </form>

          <div className="text-xs text-muted-foreground mt-2">
            Coincide por <b>nombre</b>, <b>código de bloque</b> (ej. <b>CRAI</b>), <b>keywords</b>, <b>actividades</b> y <b>referencias</b>. No distingue mayúsculas ni acentos.
          </div>
        </Card>
      )}

      {/* Panel edificio: oculto durante ruta para no tapar el mapa */}
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
                if (!userLoc) { toast.error("Activa el GPS para trazar la ruta."); return; }
                const from = L.latLng(userLoc.lat, userLoc.lng);
                const to = bestEntranceForBuilding(selectedBuilding.id, from);
                drawFootRoute(from, to, selectedRoom ?? undefined);
              }}
            >
              Trazar ruta a la ENTRADA
            </Button>

            <Button
              variant="outline"
              onClick={() => {
                setSelectedRoom(null);
                if (selectedBuilding && mapRef.current) {
                  mapRef.current.setView(
                    [selectedBuilding.latitude, selectedBuilding.longitude],
                    18,
                    { animate: true }
                  );
                }
              }}
            >
              Centrar edificio
            </Button>
          </div>
        </Card>
      )}

      {/* Chip destino mínimo durante ruta */}
      {routeActive && selectedBuilding && (
        <div className="absolute top-14 left-3 z-[1200]">
          <div className="rounded-md border bg-card/90 backdrop-blur px-3 py-2 shadow">
            <div className="text-xs text-muted-foreground">Destino</div>
            <div className="text-sm font-medium">
              {selectedRoom ? `${selectedRoom.name}${selectedRoom.room_number ? ` · ${selectedRoom.room_number}` : ""}` : selectedBuilding.name}
            </div>
          </div>
        </div>
      )}

      {/* Panel para punto compartido */}
      {sharedTarget && (
        <div className="absolute top-14 right-3 z-[1200]">
          <div className="rounded-md border bg-card/90 backdrop-blur px-3 py-2 shadow max-w-xs">
            <div className="text-xs text-muted-foreground">Punto compartido</div>
            <div className="text-sm mb-2">¿Quieres ir a ese punto?</div>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => {
                  if (!userLoc) { toast.error("Activa el GPS para trazar la ruta."); return; }
                  drawFootRoute(L.latLng(userLoc.lat, userLoc.lng), sharedTarget);
                }}
              >
                Ir a este punto
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  if (!mapRef.current) return;
                  mapRef.current.setView(sharedTarget, 18, { animate: true });
                }}
              >
                Ver
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Instrucciones: MODAL — se mantiene, pero lista muestra “pasos siguientes” */}
      <Dialog
        open={routeActive && stepsOpen && steps.length > 0}
        onOpenChange={(o) => { if (!o) { setStepsOpen(false); speakReset(); } }}
      >
        <DialogPortal>
          <DialogOverlay className="fixed inset-0 z-[3000] bg-black/50 backdrop-blur-sm" />
          <DialogContent className="z-[3001] p-0 max-w-none w-[100vw] h-[85vh] sm:h-auto sm:max-h[70vh] sm:max-w-lg">
            <div className="flex flex-col h-full">
              {/* Header */}
              <div className="px-4 py-3 border-b flex items-center justify-between">
                <div className="font-semibold">Instrucciones</div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => speakAll(steps.slice(nextStepPointer))}>▶️</Button>
                  <Button size="sm" variant="outline" onClick={speakPause}>{ttsPlaying ? "⏸️" : "⏯️"}</Button>
                  <Button size="sm" variant="outline" onClick={() => { setStepsOpen(false); speakReset(); }}>
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* Lista de pasos: SOLO los siguientes */}
              <div className="flex-1 overflow-y-auto px-4 py-3">
                <ol className="list-decimal pl-5 space-y-2 text-sm">
                  {steps.slice(nextStepPointer).map((s, i) => (<li key={i}>{s}</li>))}
                </ol>
              </div>
            </div>
          </DialogContent>
        </DialogPortal>
      </Dialog>

      {/* Botón flotante “Ver pasos” */}
      {routeActive && steps.length > 0 && !stepsOpen && (
        <div className="absolute bottom-4 right-4 z-[1200]">
          <Button size="lg" onClick={() => setStepsOpen(true)}>Ver pasos</Button>
        </div>
      )}

      {/* Botón flotante “Nueva consulta” — SIEMPRE visible (también escritorio) */}
      {routeActive && (
        <div className="absolute bottom-4 left-4 z-[1200]">
          <Button size="lg" variant="secondary" onClick={resetUI}>
            <PanelTopOpen className="w-5 h-5 mr-2" /> Nueva consulta
          </Button>
        </div>
      )}

      {/* Modal chat/búsqueda (atajo "/") */}
      <Dialog open={chatOpen} onOpenChange={setChatOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{routeActive ? "Buscar otro destino" : "Te ayudo a llegar"}</DialogTitle>
            <DialogDescription>Escribe “Bloque CRAI”, “Aula 201”, “Cómo llego a Dirección de TICs” o “plazoleta central”. También puedes pegar un enlace con <code>?lat</code> y <code>?lng</code>.</DialogDescription>
          </DialogHeader>

          <div className="border rounded-md p-3 max-h-72 overflow-y-auto space-y-2">
            {chatMsgs.map((m, i) => (
              <div key={i} className={`flex ${m.role === "assistant" ? "justify-start" : "justify-end"}`}>
                <div className={`px-3 py-2 rounded-md text-sm max-w-[80%] ${m.role === "assistant" ? "bg-muted" : "bg-primary text-primary-foreground"}`}>
                  {m.text}
                </div>
              </div>
            ))}
          </div>

          <form onSubmit={onChatSubmit} className="flex gap-2">
            <Input
              ref={chatInputRef}
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder='Ej: "Bloque CRAI", "Aula 201" o "plazoleta central"'
            />
            <Button type="submit"><Send className="w-4 h-4 mr-2" />Enviar</Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Diálogo de resultados múltiples — SIEMPRE por encima del mapa */}
      <Dialog open={resultsOpen} onOpenChange={setResultsOpen}>
        <DialogPortal>
          <DialogOverlay className="fixed inset-0 z-[3000] bg-black/50 backdrop-blur-sm" />
          <DialogContent className="z-[3001] sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Selecciona tu destino</DialogTitle>
              <DialogDescription>Encontré varias coincidencias para tu búsqueda.</DialogDescription>
            </DialogHeader>

            <div className="space-y-2 max-h-80 overflow-y-auto">
              {resultHits.map((hit, idx) => (
                <button
                  key={idx}
                  onClick={() => resolveHit(hit)}
                  className="w-full text-left border rounded-md p-2 hover:bg-accent hover:text-accent-foreground transition"
                >
                  <div className="flex items-center justify-between">
                    <div className="font-medium text-sm">
                      {hit.label}
                      {"room" in hit && hit.room.room_number ? ` · ${hit.room.room_number}` : ""}
                    </div>
                    <Badge variant={hit.kind === "room" ? "default" : "outline"}>
                      {hit.kind === "room" ? "Espacio" : hit.kind === "building" ? "Bloque" : "Referencia"}
                    </Badge>
                  </div>
                  {"sub" in hit && hit.sub && (
                    <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{hit.sub}</div>
                  )}
                </button>
              ))}
            </div>
          </DialogContent>
        </DialogPortal>
      </Dialog>
    </div>
  );
}
