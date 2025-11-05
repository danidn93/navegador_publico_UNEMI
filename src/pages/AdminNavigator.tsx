"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import * as L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet-routing-machine/dist/leaflet-routing-machine.css";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
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
import { Badge } from "@/components/ui/badge";
import PermissionsCenter from "@/pwa/PermissionsCenter";
import { Bell, KeyRound, LogOut, MapPin, Menu, PanelTopOpen, Search, UserCircle2, X } from "lucide-react"; // asegúrate de incluir todos si cambiaste arriba
import { useNavigate } from "react-router-dom";

/* ================== MARCA + RELOJ ================== */
const P7463 = "#0f2230"; // Azul UNEMI aprox (Pantone 7463 C)
const UNEMI_CENTER: [number, number] = [-2.14898719, -79.60420553];
const VAPID_PUBLIC_KEY="BGDC3SN4UrXYkmSpjcc0solx7T97gTYdqd4c13yMqz3hdZxWvhkX18ubZOb5RSmeIiJTzbMejViW5VmqpV7CVD4";

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// Función principal para suscribir al usuario
async function subscribeUserToPush() {
  try {
    const registration = await navigator.serviceWorker.ready;
    
    // Pedir permiso
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      throw new Error('Permiso de notificaciones denegado.');
    }

    // Suscribir al usuario
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });

    console.log('Suscripción Push obtenida:', subscription);

    // ¡CLAVE! Guarda esta suscripción (el JSON) en tu base de datos
    // Asociada al usuario actual (ej. en la tabla 'app_users')
    const { user } = useAuth(); // (Obtén el usuario)
     await supabase
       .from('app_users')
       .update({ push_subscription: subscription }) // Asume que tienes una columna 'push_subscription' de tipo JSONB
       .eq('id', user.id); 

    toast.success('¡Notificaciones Push activadas!');

  } catch (error) {
    console.error('Error al suscribir a Push:', error);
    toast.error('No se pudieron activar las notificaciones Push.');
  }
}

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

/* === Tigrillo (ubicación de usuario) === */
const TIGRILLO_ICON_URL = "/mascota-unemi.png";
const TIGRILLO_ICON_2X_URL = "/mascota-unemi.png";
const tigerIcon = L.icon({
  iconUrl: TIGRILLO_ICON_URL,
  iconRetinaUrl: TIGRILLO_ICON_2X_URL,
  iconSize: [42, 42],
  iconAnchor: [21, 34],
  popupAnchor: [0, -28],
});

function setOrUpdateTigerMarker(
  ll: { lat: number; lng: number },
  mapRef?: React.MutableRefObject<L.Map | null>,
  userMarkerRef?: React.MutableRefObject<L.Marker | null>
) {
  if (!mapRef?.current || !userMarkerRef) return;
  const map = mapRef.current;
  if (!userMarkerRef.current) {
    userMarkerRef.current = L.marker([ll.lat, ll.lng], {
      icon: tigerIcon,
      title: "Mi ubicación",
      zIndexOffset: 1000,
    }).addTo(map);
    return;
  }
  if (!map.hasLayer(userMarkerRef.current)) {
    try {
      userMarkerRef.current.addTo(map);
    } catch {}
  }
  try {
    userMarkerRef.current.setLatLng([ll.lat, ll.lng]);
  } catch {}
}

/* --- utils de texto --- */
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
const strongTokensOf = (tokens: string[]) =>
  tokens.filter((t) => t.length >= 3 || /^\d+$/.test(t));

/* --- reloj --- */
function useClock() {
  const [clock, setClock] = useState(() =>
    new Date().toLocaleTimeString("es-EC", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
  );
  useEffect(() => {
    const id = setInterval(() => {
      setClock(
        new Date().toLocaleTimeString("es-EC", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })
      );
    }, 1000);
    return () => clearInterval(id);
  }, []);
  return clock;
}

/* --- tipos base --- */
type AppUser = {
  usuario?: string | null;
  email?: string | null;
  nombre?: string | null;
  direccion?: string | null;
  role?: "public" | "student" | "admin";
};
type Building = any;
type Room = any;
type Floor = any;
type Landmark = any;
type Footway = any;

/* --------- Resultados de búsqueda --------- */
type HitRoom = { kind: "room"; room: Room; label: string };
type HitLandmark = { kind: "landmark"; landmark: Landmark; label: string };
type HitBuilding = { kind: "building"; building: Building; label: string };
type SearchHit = HitRoom | HitLandmark | HitBuilding;

/* --- Geo helpers --- */
const haversine = (a: L.LatLngExpression, b: L.LatLngExpression) =>
  L.latLng(a).distanceTo(L.latLng(b));
const keyOf = (lat: number, lng: number) => `${lat.toFixed(6)},${lng.toFixed(6)}`;

/* --- routing helpers (A* con penalización de giro) --- */
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
  const qx = ax + ABx * t, qy = ay + ABy * t;
  const Q = L.latLng(qy, qx);
  const dist = Q.distanceTo(P);
  return { Q, t, dist };
}
const nearestProjection = (p: L.LatLng, segments: Segment[]) => {
  let best = { Q: p, dist: Infinity, t: 0, segIndex: -1 };
  for (let i = 0; i < segments.length; i++) {
    const proj = projectPointToSegment(p, segments[i].a, segments[i].b);
    if (proj.dist < best.dist) best = { Q: proj.Q, dist: proj.dist, t: proj.t, segIndex: i };
  }
  return best;
};
function nearestNodeIfClose(
  p: L.LatLng,
  G: Map<NodeId, Node>,
  maxR = 7
): NodeId | null {
  let best: { id: NodeId; d: number } | null = null;
  for (const [id, n] of G.entries()) {
    const d = p.distanceTo([n.lat, n.lng]);
    if (d <= maxR && (!best || d < best.d)) best = { id, d };
  }
  return best?.id ?? null;
}
function cloneGraph(G: Map<NodeId, Node>) {
  const G2 = new Map<NodeId, Node>();
  for (const [id, n] of G.entries())
    G2.set(id, { id, lat: n.lat, lng: n.lng, edges: n.edges.map((e) => ({ ...e })) });
  return G2;
}
function integrateProjection(
  G: Map<NodeId, Node>,
  segments: Segment[],
  proj: { Q: L.LatLng; segIndex: number }
) {
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
    } else distAcc += d;
  }
  if (distAcc > 0) steps.push(`Continúa ${Math.round(distAcc)} m hasta la entrada.`);
  if (destino && path.length >= 2) {
    const a = path[path.length - 2], b = path[path.length - 1];
    const seg = L.latLng(b.lat - a.lat, b.lng - a.lng);
    const toDest = L.latLng(destino.lat - b.lat, destino.lng - b.lng);
    const cross = seg.lng * toDest.lat - seg.lat * toDest.lng;
    steps.push(`El destino quedará a tu ${cross > 0 ? "izquierda" : "derecha"}.`);
  }
  return steps;
}

/* ---------------- resolvePublicImageUrl ---------------- */
const resolvePublicImageUrl = async (raw: string | null | undefined): Promise<string | null> => {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;

  const candidate = trimmed.replace(/^\/+/, "");
  const tryGet = async (bucket: string, path: string) => {
    try {
      // @ts-ignore
      const from = (supabase as any).storage.from(bucket);
      const maybe = await from.getPublicUrl(path);
      if (maybe?.data?.publicUrl) return maybe.data.publicUrl as string;
      if ((maybe as any)?.publicURL) return (maybe as any).publicURL as string;
    } catch {}
    return null;
  };

  const attempts: [string, string][] = [
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

/* --------- Notificaciones --------- */
type NotificationRow = {
  id: string;
  created_at: string;
  role_target: "admin" | "student" | "public" | string;
  audience: "public" | "logged_in" | "private" | string | null;
  entity_table: string;         // buildings | rooms | footways | entrances | parkings | landmarks
  entity_id: string;            // uuid
  action: string;               // update/create/disable/enable...
  reason: string | null;
  severity: "info" | "warning" | "error" | string;
  details: any | null;          // jsonb opcional que pueda venir del trigger
};
type ViewerRole = "admin" | "student" | "public";
const ROLE_ALLOWED: Record<ViewerRole, Array<"admin" | "student" | "public">> = {
  admin: ["admin", "student", "public"],
  student: ["student", "public"],
  public: ["public"],
};
const isWithin24h = (iso: string): boolean => {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return false;
  const delta = Date.now() - t;
  const H24 = 24 * 60 * 60 * 1000;
  return delta >= 0 && delta <= H24;
};
const allowByRoleAndTime = (n: NotificationRow, viewer: ViewerRole): boolean => {
  const okTime = isWithin24h(n.created_at);
  if (!okTime) return false;
  const allowed = ROLE_ALLOWED[viewer];
  return allowed.includes((n.role_target as any) ?? "public");
};
const dtype = (t?: string | null) => {
  const k = (t ?? "").toLowerCase();
  if (k === "buildings") return "Edificio";
  if (k === "footways") return "Calle";
  if (k === "entrances") return "Entrada";
  if (k === "parkings") return "Parqueadero";
  if (k === "landmarks") return "Referencia";
  if (k === "rooms") return "Espacio";
  return "Evento";
};
const fmtBool = (v: any) => (v ? "activo" : "inactivo");

const getViewerRole = async (): Promise<ViewerRole> => {
  try {
    const { data } = await supabase.auth.getUser();
    const email = data?.user?.email?.toLowerCase();
    if (!email) return "public";
    const { data: row } = await (supabase as any)
      .from("app_users")
      .select("role")
      .eq("usuario", email)
      .maybeSingle();
    const r = (row?.role as ViewerRole) ?? "public";
    return r === "admin" || r === "student" ? r : "public";
  } catch {
    return "public";
  }
};

type EnrichedNotification = NotificationRow & {
  viewTitle: string;
  viewBody: string;
};

async function enrichNotification(n: NotificationRow): Promise<EnrichedNotification> {
  const t = (n.entity_table || "").toLowerCase();
  const id = n.entity_id;

  let title = `${dtype(t)} · ${n.action ?? "cambio"}`;
  let body = n.reason ?? "";

  try {
    if (t === "buildings") {
      const { data: b } = await (supabase as any)
        .from("buildings")
        .select("name, building_code, state, is_active")
        .eq("id", id)
        .maybeSingle();

      if (b) {
        title = `Edificio: ${b.name}${b.building_code ? " · " + b.building_code : ""}`;
        body =
          `Estado: ${b.state ?? "—"} · ${fmtBool(b.is_active)}` +
          (n.action ? ` · acción: ${n.action}` : "") +
          (n.severity ? ` · ${n.severity}` : "");
      }
    } else if (t === "footways") {
      const { data: f } = await (supabase as any)
        .from("footways")
        .select("name, state, is_active, access_type")
        .eq("id", id)
        .maybeSingle();

      if (f) {
        title = `Calle: ${f.name ?? "(sin nombre)"} (${(f.access_type ?? "").toLowerCase() || "tipo desconocido"})`;
        body =
          `Estado: ${f.state ?? "—"} · ${fmtBool(f.is_active)}` +
          (n.action ? ` · acción: ${n.action}` : "") +
          (n.severity ? ` · ${n.severity}` : "");
      }
    } else if (t === "entrances") {
      const { data: e } = await (supabase as any)
        .from("entrances")
        .select("name, type, enabled, is_active, building_id")
        .eq("id", id)
        .maybeSingle();

      let bname = "";
      if (e?.building_id) {
        const { data: b } = await (supabase as any)
          .from("buildings")
          .select("name, building_code")
          .eq("id", e.building_id)
          .maybeSingle();
        if (b) bname = ` · ${b.name}${b.building_code ? " · " + b.building_code : ""}`;
      }
      if (e) {
        title = `Entrada: ${e.name ?? "(sin nombre)"} (${(e.type ?? "").toLowerCase() || "tipo desconocido"})${bname}`;
        body =
          `Disponible: ${fmtBool(e.enabled)} · ${fmtBool(e.is_active)}` +
          (n.action ? ` · acción: ${n.action}` : "") +
          (n.severity ? ` · ${n.severity}` : "");
      }
    } else if (t === "parkings") {
      const { data: p } = await (supabase as any)
        .from("parkings")
        .select("name, type, is_active, building_id, capacity")
        .eq("id", id)
        .maybeSingle();

      let bname = "";
      if (p?.building_id) {
        const { data: b } = await (supabase as any)
          .from("buildings")
          .select("name, building_code")
          .eq("id", p.building_id)
          .maybeSingle();
        if (b) bname = ` · ${b.name}${b.building_code ? " · " + b.building_code : ""}`;
      }
      if (p) {
        title = `Parqueadero: ${p.name ?? "(sin nombre)"} (${(p.type ?? "").toLowerCase() || "tipo desconocido"})${bname}`;
        body =
          `Estado: ${fmtBool(p.is_active)}${p.capacity ? ` · cap ${p.capacity}` : ""}` +
          (n.action ? ` · acción: ${n.action}` : "") +
          (n.severity ? ` · ${n.severity}` : "");
      }
    } else if (t === "landmarks") {
      const { data: l } = await (supabase as any)
        .from("landmarks")
        .select("name, type, is_active, building_id")
        .eq("id", id)
        .maybeSingle();

      let bname = "";
      if (l?.building_id) {
        const { data: b } = await (supabase as any)
          .from("buildings")
          .select("name, building_code")
          .eq("id", l.building_id)
          .maybeSingle();
        if (b) bname = ` · ${b.name}${b.building_code ? " · " + b.building_code : ""}`;
      }
      if (l) {
        title = `Referencia: ${l.name ?? l.type}${bname}`;
        body =
          `Tipo: ${l.type} · ${fmtBool(l.is_active)}` +
          (n.action ? ` · acción: ${n.action}` : "") +
          (n.severity ? ` · ${n.severity}` : "");
      }
    } else if (t === "rooms") {
      const { data: r } = await (supabase as any)
        .from("rooms")
        .select("name, room_number, directions, is_active, floor_id")
        .eq("id", id)
        .maybeSingle();

      let bname = "";
      let piso = "";
      if (r?.floor_id) {
        const { data: f } = await (supabase as any)
          .from("floors")
          .select("floor_number, building_id")
          .eq("id", r.floor_id)
          .maybeSingle();
        if (f?.building_id) {
          const { data: b } = await (supabase as any)
            .from("buildings")
            .select("name, building_code")
            .eq("id", f.building_id)
            .maybeSingle();
          if (b) bname = ` · ${b.name}${b.building_code ? " · " + b.building_code : ""}`;
        }
        if (f?.floor_number != null) piso = ` · Piso ${f.floor_number}`;
      }

      if (r) {
        title = `Espacio: ${r.name}${r.room_number ? " · " + r.room_number : ""}${bname}${piso}`;
        body =
          `${fmtBool(r.is_active)}${r.directions ? ` · Indicaciones: ${r.directions}` : ""}` +
          (n.action ? ` · acción: ${n.action}` : "") +
          (n.severity ? ` · ${n.severity}` : "");
      }
    }
  } catch {
    // deja el title/body por defecto si algún select falla
  }

  return { ...n, viewTitle: title, viewBody: body };
}

/* ===== Etiquetas y normalizadores ===== */
type EntranceType = "pedestrian" | "vehicular" | "both" | "default";
type ParkingType  = "car" | "motorcycle" | "disabled" | "mixed" | "default";

const normEntranceType = (raw?: string | null): EntranceType => {
  const v = (raw ?? "pedestrian").toString().toLowerCase();
  if (v.startsWith("veh")) return "vehicular";
  if (v.startsWith("bo"))  return "both";
  if (v.startsWith("ped")) return "pedestrian";
  return "default";
};
const labelEntrance = (t: EntranceType) =>
  t === "vehicular" ? "vehicular" : t === "both" ? "mixta" : t === "pedestrian" ? "peatonal" : "—";

const normParkingType = (raw?: string | null): ParkingType => {
  const v = (raw ?? "car").toString().toLowerCase();
  if (v.startsWith("mot")) return "motorcycle";
  if (v.startsWith("dis")) return "disabled";
  if (v.startsWith("mix")) return "mixed";
  if (v.startsWith("car")) return "car";
  return "default";
};
const labelParking = (t: ParkingType) =>
  t === "motorcycle" ? "motos" :
  t === "disabled"   ? "discapacitados" :
  t === "mixed"      ? "mixto" : "vehículos";

// Helpers de texto para estados/etiquetas
const yesNo = (v?: boolean | null) => (v ? "sí" : "no");
const fwStateLabel = (s?: string | null, a?: boolean | null) =>
  `estado: ${(s ?? "—").toLowerCase()} · activa: ${yesNo(a ?? null)}`;
const entranceStateLabel = (e: any) =>
  `tipo: ${labelEntrance(normEntranceType(e?.type))} · habilitada: ${yesNo(e?.enabled)} · activa: ${yesNo(e?.is_active)}`;
const parkingLabel = (p: any) =>
  `tipo: ${labelParking(normParkingType(p?.type))}${p?.capacity ? ` · cap ${p.capacity}` : ""}${p?.is_active === false ? " · inactivo" : ""}`;

/* ---------------- COMPONENT ---------------- */
export default function AdminNavigator() {
  const navigate = useNavigate();
  const clock = useClock();

  /* --- estados básicos --- */
  const [query, setQuery] = useState("");
  const [userLoc, setUserLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsDenied, setGpsDenied] = useState(false);

  const [appUser, setAppUser] = useState<AppUser | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [direccion, setDireccion] = useState<string | null>(null);

  // datos campus
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [selectedBuilding, setSelectedBuilding] = useState<Building | null>(null);
  const [buildingFloors, setBuildingFloors] = useState<Floor[]>([]);
  const [buildingRooms, setBuildingRooms] = useState<Room[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);

  const [footways, setFootways] = useState<Footway[]>([]);
  const [entrances, setEntrances] = useState<any[]>([]);
  const [parkings, setParkings] = useState<any[]>([]);
  const [landmarks, setLandmarks] = useState<any[]>([]);

  const [changePwOpen, setChangePwOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [loadingPw, setLoadingPw] = useState(false);

  // notificaciones
  const [notifs, setNotifs] = useState<NotificationRow[]>([]);
  const [enrichedNotifs, setEnrichedNotifs] = useState<EnrichedNotification[]>([]);
  const [notifOpen, setNotifOpen] = useState(false);

  // Centro de permisos (GPS + Notificaciones + Sonido)
  const [permOpen, setPermOpen] = useState(false);

  // mapa y refs
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.Marker[]>([]);
  const routingRef = useRef<any>(null);
  const routeLayerRef = useRef<L.Layer | null>(null);
  const buildingNoteRef = useRef<L.Tooltip | null>(null);

  // marker usuario (tigrillo)
  const userMarkerRef = useRef<L.Marker | null>(null);

  // capas de dibujo
  const footwaysLayerRef = useRef<L.LayerGroup | null>(null);
  const entrancesLayerRef = useRef<L.LayerGroup | null>(null);
  const parkingsLayerRef = useRef<L.LayerGroup | null>(null);

  // UI rutas/instrucciones
  const [steps, setSteps] = useState<string[]>([]);
  const [ttsPlaying, setTtsPlaying] = useState(false);
  const [routeActive, setRouteActive] = useState(false);
  const [stepsOpen, setStepsOpen] = useState(false);

  // panel lateral (usuario). Por defecto CERRADO en desktop.
  const [panelOpen, setPanelOpen] = useState(false);

  // contexto del paso actual (con imágenes resueltas)
  const [currentStepBuilding, setCurrentStepBuilding] = useState<Building | null>(null);
  const [currentStepRoom, setCurrentStepRoom] = useState<Room | null>(null);

  // imagen del primer edificio del recorrido (top-right)
  const [firstRouteBuildingImage, setFirstRouteBuildingImage] = useState<string | null>(null);

  // resultados de búsqueda
  const [searchResults, setSearchResults] = useState<SearchHit[]>([]);
  const [resultsOpen, setResultsOpen] = useState(false);

  // graph refs (para routing peatonal)
  const graphRef = useRef<Map<NodeId, Node> | null>(null);
  const segmentsRef = useRef<Segment[] | null>(null);
  const triggerPtsRef = useRef<L.LatLng[]>([]);
  const routePathRef = useRef<L.LatLng[] | null>(null);

  // voz
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  // audio notificación
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const subscribeUserToPush = async () => {
    try {
      const registration = await navigator.serviceWorker.ready;
      
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        throw new Error('Permiso de notificaciones denegado.');
      }

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });

      console.log('Suscripción Push obtenida:', subscription);

      // --- GUARDA LA SUSCRIPCIÓN EN SUPABASE ---
      // (Asume que tu tabla 'app_users' tiene una columna 'push_subscription' de tipo JSONB)
      const { error }_ = await supabase
        .from('app_users') // O la tabla donde guardas tus usuarios
        .update({ push_subscription: subscription })
        .eq('id', user.id); // Asocia la suscripción al usuario logueado

      if (error) throw error;
      
      toast.success('¡Notificaciones Push activadas!');

    } catch (error) {
      console.error('Error al suscribir a Push:', error);
      toast.error('No se pudieron activar las notificaciones.');
    }
  };

  /* ===== Refresco/Realtime de notificaciones ===== */
  const refreshNotifications = useCallback(async () => {
    try {
      const viewer = await getViewerRole();

      const { data, error } = await (supabase as any)
        .from("notifications")
        .select(
          "id, created_at, role_target, audience, entity_table, entity_id, action, reason, severity, details"
        )
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;

      const onlyAllowed = (data || []).filter((n: NotificationRow) =>
        allowByRoleAndTime(n, viewer)
      );

      setNotifs(onlyAllowed);

      const enrichAll = await Promise.all(onlyAllowed.map(enrichNotification));
      setEnrichedNotifs(enrichAll);
    } catch (e) {
      console.error(e);
      toast.error("No pude leer notificaciones");
    }
  }, []);

  useEffect(() => {
    refreshNotifications();
  }, [refreshNotifications]);

  useEffect(() => {
    if (notifOpen) {
      refreshNotifications();
    }
  }, [notifOpen, refreshNotifications]);

  useEffect(() => {
    const channel = (supabase as any)
      .channel("realtime-notifications")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications" },
        () => {
          refreshNotifications();
        }
      )
      .subscribe();

    return () => {
      try {
        (supabase as any).removeChannel(channel);
      } catch {}
    };
  }, [refreshNotifications]);

  /* ------------- init: geolocation + cargar datos + user -------------- */
  // ==== Carga de datos inicial + hidratación de usuario (UN SOLO useEffect) ====
  useEffect(() => {
    // --- datasets de mapa ---
    (async () => {
      const { data, error } = await (supabase as any)
        .from("buildings")
        .select("id,name,description,latitude,longitude,total_floors,building_code,state,image_url,map_image_path")
        .eq("state", "HABILITADO")
        .order("name", { ascending: true });
      if (!error) setBuildings(data || []);
    })();

    (async () => {
      const { data, error } = await (supabase as any)
        .from("footways")
        .select("id,state,geom,access_type,is_active");
      if (!error) {
        setFootways(
          (data || []).map((fw: any) => ({
            ...fw,
            geom: typeof fw.geom === "string" ? JSON.parse(fw.geom) : fw.geom,
          }))
        );
      }
    })();

    (async () => {
      const { data, error } = await (supabase as any)
        .from("entrances")
        .select("id,building_id,name,type,location,is_active,enabled");
      if (!error) setEntrances(data || []);
    })();

    (async () => {
      const { data, error } = await (supabase as any)
        .from("parkings")
        .select("id,building_id,name,type,capacity,location,is_active");
      if (!error) setParkings(data || []);
    })();

    (async () => {
      const { data, error } = await (supabase as any)
        .from("landmarks")
        .select("id,name,type,location,building_id,is_active")
        .eq("is_active", true)
        .limit(1000);
      if (!error) setLandmarks(data || []);
    })();

    // --- hidratación de usuario (cache + DB) ---
    (async () => {
      // 1) cache local
      try {
        const raw = localStorage.getItem("appUser");
        if (raw) {
          const cached = JSON.parse(raw) as AppUser;
          setAppUser(cached);
          setDisplayName(cached.nombre || cached.usuario || cached.email || null);
          setDireccion(cached.direccion || null);
        }
      } catch {}

      // 2) sesión y fila en app_users
      try {
        const { data: auth } = await supabase.auth.getUser();
        const email = auth?.user?.email?.toLowerCase() || null;
        if (email) {
          const { data: row } = await (supabase as any)
            .from("app_users")
            .select("usuario,nombre,direccion,role")
            .eq("usuario", email)
            .maybeSingle();

          if (row) {
            const u: AppUser = {
              usuario: row.usuario ?? email,
              email: row.email ?? email,
              nombre: row.nombre ?? auth?.user?.user_metadata?.name ?? null,
              direccion: row.direccion ?? null,
              role: row.role ?? "public",
            };
            setAppUser(u);
            setDisplayName(u.nombre || u.usuario || u.email || null);
            setDireccion(u.direccion || null);
            try { localStorage.setItem("appUser", JSON.stringify(u)); } catch {}
          } else {
            const fallbackName = auth?.user?.user_metadata?.name || email || "Usuario";
            if (!displayName) setDisplayName(fallbackName);
          }
        }
      } catch {
        if (!displayName) setDisplayName("Usuario");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  // ===== Watchdog de GPS: re-crea el watch si se cae o no hay updates =====
  useEffect(() => {
    if (!("geolocation" in navigator)) return;
    let lastTs = Date.now();
    let curWatch: number | null = null;

    const startWatch = () => {
      try {
        if (curWatch != null) navigator.geolocation.clearWatch(curWatch);
      } catch {}
      curWatch = navigator.geolocation.watchPosition(
        (pos) => {
          lastTs = Date.now();
          const ll = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setUserLoc(ll);
          setOrUpdateTigerMarker(ll, mapRef, userMarkerRef);
        },
        () => {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              lastTs = Date.now();
              const ll = { lat: pos.coords.latitude, lng: pos.coords.longitude };
              setUserLoc(ll);
              setOrUpdateTigerMarker(ll, mapRef, userMarkerRef);
            },
            () => setGpsDenied(true),
            { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
          );
        },
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 3000 }
      );
    };

    startWatch();

    const watchdog = setInterval(() => {
      const SILENCE_MS = 30000; // 30s sin updates
      if (Date.now() - lastTs > SILENCE_MS) {
        startWatch();
      }
    }, 8000);

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            lastTs = Date.now();
            const ll = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            setUserLoc(ll);
            setOrUpdateTigerMarker(ll, mapRef, userMarkerRef);
          },
          () => {},
          { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
        );
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearInterval(watchdog);
      document.removeEventListener("visibilitychange", onVisible);
      try { if (curWatch != null) navigator.geolocation.clearWatch(curWatch); } catch {}
    };
  }, []);

  const handleOpenPasswordModal = () => {
    // 1. Primero, cierra el panel de usuario
    setPanelOpen(false);

    // 2. Un instante después, abre el modal de contraseña
    //    (para dar tiempo a que la animación de cierre del panel comience)
    setTimeout(() => {
      setChangePwOpen(true);
    }, 200); // 200 milisegundos suele ser suficiente
  };
  
  useEffect(() => {
    (async () => {
      const { data, error } = await (supabase as any)
        .from("buildings")
        .select("id,name,description,latitude,longitude,total_floors,building_code,state,image_url,map_image_path")
        .eq("state", "HABILITADO")
        .order("name", { ascending: true });
      if (!error) setBuildings(data || []);
    })();

    (async () => {
      const { data, error } = await (supabase as any)
        .from("footways")
        .select("id,state,geom,access_type,is_active");
      if (!error)
        setFootways(
          (data || []).map((fw: any) => ({
            ...fw,
            geom: typeof fw.geom === "string" ? JSON.parse(fw.geom) : fw.geom,
          }))
        );
    })();

    (async () => {
      const { data, error } = await (supabase as any)
        .from("entrances")
        .select("id,building_id,name,type,location,is_active,enabled");
      if (!error) setEntrances(data || []);
    })();

    (async () => {
      const { data, error } = await (supabase as any)
        .from("parkings")
        .select("id,building_id,name,type,capacity,location,is_active");
      if (!error) setParkings(data || []);
    })();

    (async () => {
      const { data, error } = await (supabase as any)
        .from("landmarks")
        .select("id,name,type,location,building_id,is_active")
        .eq("is_active", true)
        .limit(1000);
      if (!error) setLandmarks(data || []);
    })();

    try {
      const raw = localStorage.getItem("appUser");
      if (raw) setAppUser(JSON.parse(raw));
    } catch {}
  }, []);

  /* ------------- MAPA init y redibujos -------------- */
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

    footwaysLayerRef.current = L.layerGroup().addTo(map);
    entrancesLayerRef.current = L.layerGroup().addTo(map);
    parkingsLayerRef.current = L.layerGroup().addTo(map);

    addBuildingMarkers();
    drawFootways();
    drawEntrances();
    drawParkings();
  }, []);

  useEffect(() => {
    addBuildingMarkers();
    drawFootways();
    drawEntrances();
    drawParkings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildings, footways, entrances, parkings]);

  const addBuildingMarkers = () => {
    if (!mapRef.current) return;
    markersRef.current.forEach((m) => mapRef.current?.removeLayer(m));
    markersRef.current = [];

    buildings.forEach((b: any) => {
      const marker = L.marker([b.latitude, b.longitude], { title: b.name });
      marker.on("click", async () => {
        await handleSelectBuilding(b, true);
        const imgUrl =
          (await resolvePublicImageUrl(b.image_url || b.map_image_path || null)) ?? null;
        const html = `
          <div style="max-width:220px">
            <div style="font-weight:600;margin-bottom:4px">${b.name}</div>
            ${
              imgUrl
                ? `<div style="border-radius:6px;overflow:hidden;border:1px solid rgba(0,0,0,.15)">
                     <img src="${imgUrl}" alt="${b.name}" style="width:100%;height:auto;display:block" />
                   </div>`
                : ""
            }
          </div>
        `;
        L.popup().setLatLng([b.latitude, b.longitude]).setContent(html).openOn(mapRef.current!);
      });
      marker.addTo(mapRef.current!);
      markersRef.current.push(marker);
    });
  };

  /* ===== Estilos para capas ===== */
  const FOOTWAY_STYLE: Record<string, L.PolylineOptions> = {
    pedestrian: { color: "#2E7D32", weight: 5, opacity: 0.95 },
    vehicular:  { color: "#1565C0", weight: 5, opacity: 0.95 },
    both:       { color: "#00897B", weight: 5, opacity: 0.95 },
    default:    { color: "#546e7a", weight: 5, opacity: 0.9  },
    off_ped: { color: "#C62828", weight: 4, opacity: 0.6, dashArray: "6,6" },
    off_veh: { color: "#8E24AA", weight: 4, opacity: 0.6, dashArray: "6,6" },
    off_both:{ color: "#6D4C41", weight: 4, opacity: 0.6, dashArray: "6,6" },
  };
  
  const ENTRANCE_STYLE: Record<string, { color: string; off?: string }> = {
    pedestrian: { color: "#2E7D32", off: "#ef9a9a" },
    vehicular:  { color: "#1565C0", off: "#b39ddb" },
    both:       { color: "#00897B", off: "#bcaaa4" },
    default:    { color: "#455A64", off: "#b0bec5" },
  };
  const PARKING_STYLE: Record<string, { color: string; radius?: number; off?: string }> = {
    car:        { color: "#455A64", radius: 7, off: "#cfd8dc" },
    motorcycle: { color: "#F57C00", radius: 7, off: "#ffe0b2" },
    disabled:   { color: "#1976D2", radius: 7, off: "#bbdefb" },
    mixed:      { color: "#5E35B1", radius: 7, off: "#d1c4e9" },
    default:    { color: "#5E35B1", radius: 7, off: "#d1c4e9" },
  };

  const drawFootways = () => {
    const group = footwaysLayerRef.current;
    if (!mapRef.current || !group) return;
    group.clearLayers();

    // helper: convertir geom a lista de líneas [ [lng,lat], ... ]
    const toLines = (geom: any): [number, number][][] => {
      if (!geom) return [];
      const g = typeof geom === "string" ? JSON.parse(geom) : geom;
      const t = (g?.type || "").toLowerCase();
      if (t === "linestring") return [g.coordinates as [number, number][]];
      if (t === "multilinestring") return g.coordinates as [ [number, number][] ];
      // fallback a formato antiguo {coordinates:[...]}
      if (Array.isArray(g?.coordinates) && Array.isArray(g.coordinates[0]) && typeof g.coordinates[0][0] === "number") {
        return [g.coordinates as [number, number][]];
      }
      return [];
    };

    (footways || []).forEach((fw: any) => {
      try {
        const isOpen = norm((fw.state ?? "").toString()) === "abierto" && fw.is_active !== false;
        const t = normEntranceType(fw.access_type || "default");

        const styleKey =
          isOpen ? t :
          t === "pedestrian" ? "off_ped" :
          t === "vehicular"  ? "off_veh" :
          t === "both"       ? "off_both" : "default";

        const style = FOOTWAY_STYLE[styleKey] || FOOTWAY_STYLE.default;

        const lines = toLines(fw.geom);
        lines.forEach((coords) => {
          if (!coords?.length) return;
          const latlngs = coords.map(([lng, lat]) => [lat, lng]) as [number, number][];
          L.polyline(latlngs, {
            weight: style.weight ?? 5,
            opacity: style.opacity ?? 0.95,
            color: style.color,
            dashArray: style.dashArray,
          })
            .bindTooltip(`Calle: ${labelEntrance(t)}`, { direction: "top" })
            .addTo(group);
        });
      } catch { /* ignore dibujo de una calle fallida */ }
    });
  };

  const drawEntrances = () => {
    const group = entrancesLayerRef.current;
    if (!mapRef.current || !group) return;
    group.clearLayers();

    (entrances || []).forEach((e: any) => {
      const [lng, lat] = e.location?.coordinates || [];
      if (lng == null || lat == null) return;

      const t = normEntranceType(e.type || "default");
      const st = ENTRANCE_STYLE[t] || ENTRANCE_STYLE.default;
      const isOff = !(e?.is_active && e?.enabled);
      L.circleMarker([lat, lng], {
        radius: 6, opacity: 1, fillOpacity: 0.95,
        color: isOff ? (st.off ?? "#b0bec5") : st.color,
        weight: 2, fillColor: isOff ? (st.off ?? "#b0bec5") : st.color,
      })
        .bindTooltip(
          `Entrada: ${labelEntrance(t)}${e.name ? ` · ${e.name}` : ""}${isOff ? " · (cerrada)" : ""}`,
          { direction: "top" }
        )
        .addTo(group);
    });
  };

  const drawParkings = () => {
    const group = parkingsLayerRef.current;
    if (!mapRef.current || !group) return;
    group.clearLayers();

    (parkings || []).forEach((p: any) => {
      const [lng, lat] = p.location?.coordinates || [];
      if (lng == null || lat == null) return;

      const t = normParkingType(p.type || "default");
      const st = PARKING_STYLE[t] || PARKING_STYLE.default;

      L.circleMarker([lat, lng], {
        radius: st.radius ?? 7,
        opacity: 1,
        fillOpacity: 0.95,
        color: st.color,
        weight: 2,
        fillColor: st.color,
      })
        .bindTooltip(
          `${p.name ?? "Parqueadero"} · ${labelParking(t)}${p.capacity ? ` · cap ${p.capacity}` : ""}`,
          { direction: "top" }
        )
        .addTo(group);
    });
  };

  /* ------------- BÚSQUEDA -------------- */
  const distanceFromUser = (u: { lat: number; lng: number } | null, item: SearchHit) => {
    if (!u) return Infinity;
    try {
      if (item.kind === "room") {
        const r = item.room as any;
        if (r.building_latitude != null && r.building_longitude != null)
          return L.latLng(u.lat, u.lng).distanceTo([r.building_latitude, r.building_longitude]);
      }
      if (item.kind === "landmark") {
        const coords = (item.landmark as any).location?.coordinates;
        if (coords && coords.length >= 2) {
          const [lng, lat] = coords;
          return L.latLng(u.lat, u.lng).distanceTo([lat, lng]);
        }
      }
      if (item.kind === "building") {
        const b = item.building as any;
        if (b.latitude != null && b.longitude != null)
          return L.latLng(u.lat, u.lng).distanceTo([b.latitude, b.longitude]);
      }
    } catch {}
    return Infinity;
  };

  const findBuilding = (termRaw: string): Building[] => {
    let t = norm(termRaw).replace(/^bloque\s+/, "");
    const tokens = tokenize(t);
    const strong = strongTokensOf(tokens);
    if (strong.length === 0) return [];
    const strict = buildings.filter((b: any) => {
      const label = `${b.name} ${b.building_code ?? ""}`;
      return strong.every((tt) => normAlnum(label).includes(tt));
    });
    if (strict.length > 0) return strict;
    return buildings.filter((b: any) => {
      const label = `${b.name} ${b.building_code ?? ""}`;
      return strong.some((tt) => normAlnum(label).includes(tt));
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

    const allowed = ["public", "student", "admin"];
    const { data, error } = await (supabase as any)
      .from("rooms")
      .select(
        "id,floor_id,name,room_number,description,directions,room_type_id,capacity,equipment,keywords,actividades,target,image_url,map_image_path"
      )
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
      const { data: types } = await (supabase as any)
        .from("room_types")
        .select("id,name")
        .in("id", typeIds);
      (types || []).forEach((t: any) => typeMap.set(t.id, t.name));
    }

    const enriched: Room[] = await Promise.all(
      rooms0.map(async (r) => {
        try {
          const { data: floor } = await (supabase as any)
            .from("floors")
            .select("id,floor_number,building_id")
            .eq("id", r.floor_id)
            .single();
          let building_name = null,
            building_lat = null,
            building_lng = null;
          if (floor?.building_id) {
            const { data: b } = await (supabase as any)
              .from("buildings")
              .select("id,name,latitude,longitude")
              .eq("id", floor.building_id)
              .single();
            if (b) {
              building_name = b.name;
              building_lat = b.latitude;
              building_lng = b.longitude;
            }
          }
          return {
            ...r,
            floor: floor
              ? { id: floor.id, floor_number: floor.floor_number, building_id: floor.building_id }
              : r.floor,
            room_type_name: typeMap.get(r.room_type_id) ?? null,
            building_name,
            building_latitude: building_lat,
            building_longitude: building_lng,
          } as Room;
        } catch {
          return { ...r, room_type_name: typeMap.get(r.room_type_id) ?? null } as Room;
        }
      })
    );

    return enriched;
  };

  const findLandmarksMany = async (termRaw: string): Promise<Landmark[]> => {
    const tokens = tokenize(termRaw);
    const strong = strongTokensOf(tokens);
    const { data, error } = await (supabase as any)
      .from("landmarks")
      .select("id,name,type,location,building_id")
      .limit(200);
    if (error) return [];
    const list = (data || []) as Landmark[];
    return list.filter((lm) => {
      const label = `${lm.name ?? ""} ${lm.type}`;
      return strong.length > 0
        ? strong.every((t) => normAlnum(label).includes(t))
        : tokens.some((t) => normAlnum(label).includes(t));
    });
  };

  const fetchRouteByName = async (term: string) => {
    const { data, error } = await (supabase as any)
      .from("routes")
      .select("id,name,description,is_active")
      .ilike("name", `%${term}%`)
      .eq("is_active", true)
      .limit(1);
    if (error) {
      console.error(error);
      return null;
    }
    return data?.[0] ?? null;
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
    } catch {
      setFirstRouteBuildingImage(null);
    }
    setRouteActive(true);
    setStepsOpen(false);
    await playCurrentRouteStepIndex(0, r, steps);
  };

  const SEARCH_MIN = 2;
  useEffect(() => {
    const q = (query || "").trim();
    if (q.length < SEARCH_MIN) {
      setSearchResults([]);
      setResultsOpen(false);
      return;
    }
    const h = setTimeout(() => {
      void liveSearch(q);
    }, 180);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, buildings, landmarks]);

  async function liveSearch(q: string) {
    try {
      const [rooms, lms] = await Promise.all([findRooms(q), findLandmarksMany(q)]);
      const bls = findBuilding(q);

      const hits: SearchHit[] = [
        ...rooms.map((r) => ({ kind: "room", room: r, label: r.name }) as HitRoom),
        ...lms.map((l) => ({ kind: "landmark", landmark: l, label: l.name ?? l.type }) as HitLandmark),
        ...bls.map((b) => ({ kind: "building", building: b, label: b.name }) as HitBuilding),
      ];

      if (hits.length === 0) {
        setSearchResults([]);
        setResultsOpen(false);
        return;
      }
      setSearchResults(hits);
    } catch (e) {
      console.error(e);
    }
  }

  const clearSearch = () => {
    setQuery("");
    setSearchResults([]);
    setResultsOpen(false);
  };

  const CATEGORY_NEAREST = [
    "baño","baños","wc","servicio","servicios",
    "punto de encuentro","puntos de encuentro","encuentro",
    "tienda","tiendas","shop","shops","bar","bares",
    "restaurante","restaurantes",
    "parqueadero","parqueaderos","estacionamiento","estacionamientos","parking",
  ].map((s) => norm(s));

  const handleSearch = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const q = (query || "").trim();
    if (!q) return;

    const rooms = await findRooms(q);
    const lms = await findLandmarksMany(q);
    const bls = findBuilding(q);

    const hits: SearchHit[] = [
      ...rooms.map((r) => ({ kind: "room", room: r, label: r.name }) as HitRoom),
      ...lms.map((l) => ({ kind: "landmark", landmark: l, label: l.name ?? l.type }) as HitLandmark),
      ...bls.map((b) => ({ kind: "building", building: b, label: b.name }) as HitBuilding),
    ];

    if (hits.length === 0) {
      const asRoute = await fetchRouteByName(q);
      if (asRoute) {
        await startRouteByName(q);
        return;
      }
      toast.error("Sin resultados");
      return;
    }

    const normalizedQuery = norm(q);
    const isCategoryQuery = CATEGORY_NEAREST.some(
      (c) => normalizedQuery.includes(c) || q.toLowerCase().includes(c)
    );

    if (isCategoryQuery && userLoc) {
      const scored = hits
        .map((h) => ({ item: h, d: distanceFromUser(userLoc, h) }))
        .sort((a, b) => a.d - b.d);
      const best = scored[0];
      if (best && best.d < Infinity) {
        const h = best.item;
        if (h.kind === "room") {
          setSearchResults([]);
          setResultsOpen(false);
          await focusRoom(h.room);
          return;
        }
        if (h.kind === "landmark") {
          setSearchResults([]);
          setResultsOpen(false);
          await focusLandmark(h.landmark);
          return;
        }
        if (h.kind === "building") {
          setSearchResults([]);
          setResultsOpen(false);
          await handleSelectBuilding(h.building, true);
          return;
        }
      }
    }

    if (hits.length === 1) {
      const h = hits[0];
      if (h.kind === "room") await focusRoom(h.room);
      else if (h.kind === "landmark") await focusLandmark(h.landmark);
      else if (h.kind === "building") await handleSelectBuilding(h.building, true);
      return;
    }

    setSearchResults(hits);
    setResultsOpen(true);
  };

  /* ---------------- focus helpers ---------------- */
  const handleSelectBuilding = async (b: Building, fit = false) => {
    setSelectedBuilding(b);
    setSelectedRoom(null);
    if (mapRef.current && fit) {
      mapRef.current.setView([b.latitude, b.longitude], 18, { animate: true });
      const imgUrl = await resolvePublicImageUrl(b.image_url || b.map_image_path || null);
      const html = `
        <div style="max-width:220px">
          <div style="font-weight:600;margin-bottom:4px">${b.name}</div>
          ${
            imgUrl
              ? `<img src="${imgUrl}" alt="${b.name}" style="width:100%;height:auto;border-radius:6px;border:1px solid rgba(0,0,0,.15)"/>`
              : ""
          }
        </div>
      `;
      L.popup().setLatLng([b.latitude, b.longitude]).setContent(html).openOn(mapRef.current);
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
      const floorIds = (floors || []).map((f: any) => f.id);
      if (!floorIds.length) {
        setBuildingRooms([]);
        return;
      }

      const allowed = ["public", "student", "admin"];
      const { data: rooms, error: roomsErr } = await (supabase as any)
        .from("rooms")
        .select(
          "id,floor_id,name,room_number,description,directions,room_type_id,capacity,equipment,keywords,actividades,target,image_url,map_image_path"
        )
        .in("floor_id", floorIds)
        .in("target", allowed)
        .order("name", { ascending: true });
      if (roomsErr) throw roomsErr;

      const fMap = new Map<string, Floor>();
      (floors || []).forEach((f: any) => fMap.set(f.id, f));
      const typeIds = Array.from(
        new Set(((rooms || []) as any).map((r: any) => r.room_type_id).filter(Boolean))
      );
      let typeMap = new Map<string, string>();
      if (typeIds.length) {
        const { data: types } = await (supabase as any)
          .from("room_types")
          .select("id,name")
          .in("id", typeIds);
        (types || []).forEach((t: any) => typeMap.set(t.id, t.name));
      }

      const enhanced = await Promise.all(
        (rooms || []).map(async (r: any) => {
          const roomObj: Room = {
            ...r,
            floor: fMap.get(r.floor_id)
              ? { id: r.floor_id, floor_number: fMap.get(r.floor_id)!.floor_number }
              : undefined,
            room_type_name: typeMap.get(r.room_type_id) ?? null,
          };
          const resolvedRoomImg = await resolvePublicImageUrl(
            roomObj.image_url || roomObj.map_image_path || null
          );
          if (resolvedRoomImg) roomObj.image_url = resolvedRoomImg;
          return roomObj;
        })
      );
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
      toast.message("Activa el GPS para trazar la ruta a la referencia.");
      mapRef.current.setView(ll, 18, { animate: true });
      L.popup().setLatLng(ll).setContent(`<b>${lm.name ?? lm.type}</b>`).openOn(mapRef.current);
      return;
    }
    await drawFootRoute(L.latLng(userLoc.lat, userLoc.lng), ll);
    mapRef.current.setView(ll, 18, { animate: true });
    L.popup().setLatLng(ll).setContent(`<b>${lm.name ?? lm.type}</b>`).openOn(mapRef.current);
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
        .select(
          "id,name,description,latitude,longitude,total_floors,building_code,state,image_url,map_image_path"
        )
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

      if (!userLoc) {
        toast.error("Activa el GPS para trazar la ruta.");
        return;
      }

      const resolvedBuildingImg = await resolvePublicImageUrl(
        (building as any).image_url || (building as any).map_image_path || null
      );
      const resolvedRoomImg = await resolvePublicImageUrl(
        roomWithFloor.image_url || roomWithFloor.map_image_path || null
      );

      const buildingWithResolved = {
        ...(building || {}),
        image_url: resolvedBuildingImg || (building as any)?.image_url || null,
      };
      const roomWithResolved = {
        ...(roomWithFloor || {}),
        image_url: resolvedRoomImg || (roomWithFloor as any)?.image_url || null,
      };

      setCurrentStepBuilding(buildingWithResolved);
      setCurrentStepRoom(roomWithResolved);

      const from = L.latLng(userLoc.lat, userLoc.lng);
      const to = await bestEntranceByGraphDistance((building as any).id, from);
      await drawFootRoute(from, to, roomWithResolved);
    } catch (e) {
      console.error(e);
      toast.error("No se pudo focalizar el espacio");
    }
  };

  // --- tolerancias en metros ---
  const EPS_INTERSECT = 2.0;
  const EPS_CONNECT = 14.0;
  const EPS_MERGE = 2.5;

  function toXY(lat: number, lng: number) {
    const R = 6378137;
    const x = ((lng * Math.PI) / 180) * R * Math.cos((lat * Math.PI) / 180);
    const y = ((lat * Math.PI) / 180) * R;
    return { x, y };
  }
  function distMetersLL(a: L.LatLng, b: L.LatLng) {
    return a.distanceTo(b);
  }
  function segmentIntersectionLL(
    a1: L.LatLng,
    a2: L.LatLng,
    b1: L.LatLng,
    b2: L.LatLng
  ): L.LatLng | null {
    const A1 = toXY(a1.lat, a1.lng), A2 = toXY(a2.lat, a2.lng);
    const B1 = toXY(b1.lat, b1.lng), B2 = toXY(b2.lat, b2.lng);
    const r = { x: A2.x - A1.x, y: A2.y - A1.y };
    const s = { x: B2.x - B1.x, y: B2.y - B1.y };
    const rxs = r.x * s.y - r.y * s.x;
    const qpxr = (B1.x - A1.x) * r.y - (B1.y - A1.y) * r.x;

    if (Math.abs(rxs) < 1e-9) return null;

    const t = ((B1.x - A1.x) * s.y - (B1.y - A1.y) * s.x) / rxs;
    const u = qpxr / rxs;

    if (t >= -1e-6 && t <= 1 + 1e-6 && u >= -1e-6 && u <= 1 + 1e-6) {
      const R = 6378137;
      const ix = A1.x + t * r.x, iy = A1.y + t * r.y;
      const lat = (iy / R) * (180 / Math.PI);
      const lng = (ix / (R * Math.cos((a1.lat * Math.PI) / 180))) * (180 / Math.PI);
      return L.latLng(lat, lng);
    }
    return null;
  }
  function splitSegmentAtPoint(seg: Segment, P: L.LatLng, eps = EPS_INTERSECT): Segment[] | null {
    const dA = distMetersLL(seg.a, P);
    const dB = distMetersLL(seg.b, P);
    const len = distMetersLL(seg.a, seg.b);
    if (dA <= eps || dB <= eps) return null;
    if (dA + dB > len + 0.05) return null;
    const pid = keyOf(P.lat, P.lng);
    const s1: Segment = { a: seg.a, b: P, aId: seg.aId, bId: pid };
    const s2: Segment = { a: P, b: seg.b, aId: pid, bId: seg.bId };
    return [s1, s2];
  }
  function splitAllSegmentsAtIntersections(segments: Segment[], eps = EPS_INTERSECT): Segment[] {
    let segs = segments.slice();
    let changed = true;
    while (changed) {
      changed = false;
      outer: for (let i = 0; i < segs.length; i++) {
        for (let j = i + 1; j < segs.length; j++) {
          const s1 = segs[i], s2 = segs[j];
          const P = segmentIntersectionLL(s1.a, s1.b, s2.a, s2.b);
          if (!P) continue;

          const s1parts = splitSegmentAtPoint(s1, P, eps);
          const s2parts = splitSegmentAtPoint(s2, P, eps);

          if (s1parts || s2parts) {
            const next: Segment[] = [];
            for (let k = 0; k < segs.length; k++) {
              if (k === i) next.push(...(s1parts ?? [s1]));
              else if (k === j) next.push(...(s2parts ?? [s2]));
              else next.push(segs[k]);
            }
            segs = next;
            changed = true;
            break outer;
          }
        }
      }
    }
    return segs;
  }
  function stitchDanglingEndpoints(
    segs: Segment[],
    maxDist = EPS_CONNECT,
    maxAngleDeg = 25
  ): Segment[] {
    const byNode = new Map<NodeId, Segment[]>();
    const push = (id: NodeId, s: Segment) => {
      const arr = byNode.get(id) || [];
      arr.push(s);
      byNode.set(id, arr);
    };
    segs.forEach((s) => {
      push(s.aId, s);
      push(s.bId, s);
    });

    const dirOf = (id: NodeId): { x: number; y: number } | null => {
      const list = byNode.get(id);
      if (!list || !list.length) return null;
      let vx = 0, vy = 0;
      for (const s of list) {
        const v1 = { x: s.b.lng - s.a.lng, y: s.b.lat - s.a.lat };
        const v2 = { x: s.a.lng - s.b.lng, y: s.a.lat - s.b.lat };
        if (s.aId === id) {
          const m = Math.hypot(v1.x, v1.y) || 1;
          vx += v1.x / m; vy += v1.y / m;
        } else if (s.bId === id) {
          const m = Math.hypot(v2.x, v2.y) || 1;
          vx += v2.x / m; vy += v2.y / m;
        }
      }
      const m = Math.hypot(vx, vy) || 1;
      return { x: vx / m, y: vy / m };
    };

    const endpoints: { pt: L.LatLng; id: NodeId }[] = [];
    segs.forEach((s) => {
      endpoints.push({ pt: s.a, id: s.aId });
      endpoints.push({ pt: s.b, id: s.bId });
    });

    const exist = new Set<string>();
    segs.forEach((s) => {
      const k1 = `${s.aId}|${s.bId}`;
      const k2 = `${s.bId}|${s.aId}`;
      exist.add(k1);
      exist.add(k2);
    });

    const add: Segment[] = [];
    const cosMax = Math.cos((maxAngleDeg * Math.PI) / 180);

    for (let i = 0; i < endpoints.length; i++) {
      for (let j = i + 1; j < endpoints.length; j++) {
        const e1 = endpoints[i], e2 = endpoints[j];
        if (e1.id === e2.id) continue;

        const d = distMetersLL(e1.pt, e2.pt);
        if (d > maxDist) continue;

        const vdir = { x: e2.pt.lng - e1.pt.lng, y: e2.pt.lat - e1.pt.lat };
        const mv = Math.hypot(vdir.x, vdir.y) || 1;
        vdir.x /= mv; vdir.y /= mv;

        const d1 = dirOf(e1.id);
        const d2 = dirOf(e2.id);
        let okAngle = true;
        if (d1) {
          const cos1 = d1.x * vdir.x + d1.y * vdir.y;
          if (cos1 < cosMax) okAngle = false;
        }
        if (d2 && okAngle) {
          const cos2 = -(d2.x * vdir.x + d2.y * vdir.y);
          if (cos2 < cosMax) okAngle = false;
        }
        if (!okAngle) continue;

        const k = `${e1.id}|${e2.id}`;
        if (!exist.has(k)) {
          exist.add(k);
          exist.add(`${e2.id}|${e1.id}`);
          add.push({
            a: e1.pt,
            b: e2.pt,
            aId: e1.id,
            bId: e2.id,
          });
        }
      }
    }

    return segs.concat(add);
  }
  function mergeNearNodes(
    segs: Segment[],
    eps = EPS_MERGE
  ): { segs: Segment[]; nodePos: Map<NodeId, L.LatLng> } {
    const nodes: L.LatLng[] = [];
    const ids: string[] = [];
    const pushNode = (pt: L.LatLng, id: string) => {
      nodes.push(pt);
      ids.push(id);
    };
    segs.forEach((s) => {
      pushNode(s.a, s.aId);
      pushNode(s.b, s.bId);
    });

    const n = nodes.length;
    const parent = Array.from({ length: n }, (_, i) => i);
    const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])));
    const unite = (a: number, b: number) => {
      a = find(a); b = find(b);
      if (a !== b) parent[b] = a;
    };
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (distMetersLL(nodes[i], nodes[j]) <= eps) unite(i, j);
      }
    }

    const sum = new Map<number, { lat: number; lng: number; c: number }>();
    for (let i = 0; i < n; i++) {
      const r = find(i);
      const s = sum.get(r) ?? { lat: 0, lng: 0, c: 0 };
      s.lat += nodes[i].lat;
      s.lng += nodes[i].lng;
      s.c += 1;
      sum.set(r, s);
    }
    const clusterCentroid = new Map<number, L.LatLng>();
    sum.forEach((v, r) => clusterCentroid.set(r, L.latLng(v.lat / v.c, v.lng / v.c)));

    const mapOldToNew = new Map<NodeId, NodeId>();
    const newPos = new Map<NodeId, L.LatLng>();
    for (let i = 0; i < n; i++) {
      const r = find(i);
      const C = clusterCentroid.get(r)!;
      const newId = keyOf(C.lat, C.lng);
      mapOldToNew.set(ids[i], newId);
      newPos.set(newId, C);
    }

    const out: Segment[] = [];
    const seen = new Set<string>();
    for (const s of segs) {
      const aId = mapOldToNew.get(s.aId)!;
      const bId = mapOldToNew.get(s.bId)!;
      if (aId === bId) continue;
      const a = newPos.get(aId)!;
      const b = newPos.get(bId)!;
      const key = aId < bId ? `${aId}|${bId}` : `${bId}|${aId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ a, b, aId, bId });
    }

    return { segs: out, nodePos: newPos };
  }

  /* ---------------- graph builders / routing helpers ---------------- */
  const buildGraphAndSegments = (foot: Footway[]) => {
    // solo calles abiertas/activas (normalizadas)
    const footOpen = (foot || []).filter((fw: any) => {
      const open = norm((fw?.state ?? "").toString()) === "abierto";
      return open && fw?.is_active !== false;
    });

    const initial: Segment[] = [];

    const pushLine = (coords: [number, number][]) => {
      for (let i = 0; i < coords.length - 1; i++) {
        const [lng1, lat1] = coords[i];
        const [lng2, lat2] = coords[i + 1];
        const a = L.latLng(lat1, lng1);
        const b = L.latLng(lat2, lng2);
        initial.push({ a, b, aId: keyOf(a.lat, a.lng), bId: keyOf(b.lat, b.lng) });
      }
    };

    // aceptar LineString y MultiLineString
    for (const fw of footOpen) {
      const geom = typeof (fw as any).geom === "string" ? JSON.parse((fw as any).geom) : (fw as any).geom;
      if (!geom) continue;
      const t = (geom.type || "").toLowerCase();
      if (t === "linestring") pushLine(geom.coordinates as [number, number][]);
      else if (t === "multilinestring") {
        (geom.coordinates as [ [number, number][] ]).forEach(pushLine);
      } else if (geom.coordinates) {
        // fallback al formato antiguo
        pushLine(geom.coordinates as [number, number][]);
      }
    }

    // tolerancias para cerrar pequeños gaps del mapeo
    let segs = splitAllSegmentsAtIntersections(initial, 3.0); // antes 2.0
    segs = stitchDanglingEndpoints(segs, 22.0, 28);           // antes 14m / 25°
    const merged = mergeNearNodes(segs, 3.5);                 // antes 2.5

    // construir grafo
    const G = new Map<NodeId, Node>();
    const addNode = (id: NodeId, pt: L.LatLng) => {
      if (!G.has(id)) G.set(id, { id, lat: pt.lat, lng: pt.lng, edges: [] });
    };
    const connect = (aId: NodeId, bId: NodeId, w: number) => {
      const A = G.get(aId)!;
      const B = G.get(bId)!;
      if (!A.edges.some((e) => e.to === bId)) A.edges.push({ to: bId, w });
      if (!B.edges.some((e) => e.to === aId)) B.edges.push({ to: aId, w });
    };

    for (const s of merged.segs) {
      addNode(s.aId, s.a);
      addNode(s.bId, s.b);
      connect(s.aId, s.bId, s.a.distanceTo(s.b));
    }

    return { G, segs: merged.segs };
  };

  const ensureGraphWithSegments = () => {
    if (!graphRef.current || !segmentsRef.current) {
      const { G, segs } = buildGraphAndSegments(footways);
      graphRef.current = G;
      segmentsRef.current = segs;
    }
    return { G: graphRef.current!, segments: segmentsRef.current! };
  };

  const TURN_PENALTY_90M = 0;
  function edgeCostWithTurn(
    G: Map<NodeId, Node>,
    prev: NodeId | null,
    from: NodeId,
    to: NodeId
  ) {
    const A = G.get(from)!;
    const B = G.get(to)!;
    const base = L.latLng(A.lat, A.lng).distanceTo([B.lat, B.lng]);
    if (!prev) return base;

    const P = G.get(prev)!;
    const theta = angleBetween(
      L.latLng(P.lat, P.lng),
      L.latLng(A.lat, A.lng),
      L.latLng(B.lat, B.lng)
    );

    // penalización lineal con el ángulo, pero con CAP:
    const rawPenalty = (TURN_PENALTY_90M / (Math.PI / 2)) * theta;

    //  ➜ nunca más del 12–15% del tramo que vas a recorrer
    const cappedPenalty = Math.min(rawPenalty, base * 0.12);

    return base + cappedPenalty;
  }

  function angleBetween(a: L.LatLng, b: L.LatLng, c: L.LatLng) {
    const v1x = b.lng - a.lng, v1y = b.lat - a.lat;
    const v2x = c.lng - b.lng, v2y = c.lat - b.lat;
    const m1 = Math.hypot(v1x, v1y) || 1;
    const m2 = Math.hypot(v2x, v2y) || 1;
    const cos = (v1x * v2x + v1y * v2y) / (m1 * m2);
    return Math.acos(Math.max(-1, Math.min(1, cos)));
  }
  
  const astarWithTurns = (G: Map<NodeId, Node>, start: NodeId, goal: NodeId): NodeId[] | null => {
    const h = (a: NodeId, b: NodeId) => {
      const A = G.get(a)!, B = G.get(b)!;
      return L.latLng(A.lat, A.lng).distanceTo([B.lat, B.lng]);
    };

    const open = new Set<NodeId>([start]);
    const came = new Map<NodeId, NodeId>();
    const prevOf = new Map<NodeId, NodeId | null>();
    prevOf.set(start, null);

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
      const prev = prevOf.get(cur) ?? null;

      for (const e of G.get(cur)!.edges) {
        const step = edgeCostWithTurn(G, prev, cur, e.to);
        const ng = curG + step;

        if (ng < (g.get(e.to) ?? Infinity)) {
          came.set(e.to, cur);
          prevOf.set(e.to, cur);
          g.set(e.to, ng);
          f.set(e.to, ng + h(e.to, goal));
          open.add(e.to);
        }
      }
    }
    return null;
  };

  const SNAP_MAX = 90;
  /** Devuelve NodeId cercano o crea proyección sobre el segmento más cercano */
  function closestGraphNodeOrProjection(
    G: Map<NodeId, Node>,
    segments: Segment[],
    p: L.LatLng
  ): NodeId {
    const near = nearestNodeIfClose(p, G, 50); // 50 m
    if (near) return near;
    const proj = nearestProjection(p, segments); // sin límite de distancia
    return integrateProjection(G, segments, proj);
  }

  /** Si el destino cae fuera del campus, acércalo a la entrada habilitada más próxima */
  function clampOutsideToNearestEntrance(toLL: L.LatLng, entrances: any[]): L.LatLng {
    if (!entrances?.length) return toLL;
    let best: { ll: L.LatLng; d: number } | null = null;
    for (const e of entrances) {
      const [lng, lat] = e.location?.coordinates || [];
      if (lng == null || lat == null) continue;
      const ll = L.latLng(lat, lng);
      const d = toLL.distanceTo(ll);
      if (!best || d < best.d) best = { ll, d };
    }
    return best?.ll ?? toLL;
  }

  function routeOnCampus(fromLL: L.LatLng, toLL: L.LatLng): L.LatLng[] | null {
    if (!footways.length) return null;

    const { G: baseG, segments } = ensureGraphWithSegments();
    if (!baseG || baseG.size === 0 || segments.length === 0) return null;

    // Clon para poder inyectar proyecciones sin tocar el grafo base
    const G = cloneGraph(baseG);

    // Acerca el destino a la entrada habilitada más cercana si cae fuera de la malla
    const toLLClamped = clampOutsideToNearestEntrance(toLL, entrances);

    // SIEMPRE “snap” de ambos extremos al grafo (nodo cercano o proyección)
    const fromId = closestGraphNodeOrProjection(G, segments, fromLL);
    const toId   = closestGraphNodeOrProjection(G, segments, toLLClamped);

    const ids = astarWithTurns(G, fromId, toId);
    if (!ids || ids.length < 2) return null;

    return ids.map((id) => {
      const n = G.get(id)!;
      return L.latLng(n.lat, n.lng);
    });
  }

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

  const bestEntranceByStraightDistance = (buildingId: string, fromLL: L.LatLng) => {
    const list = entrances.filter((e) => e.building_id === buildingId);
    if (!list.length) {
      const b = buildings.find((x: any) => x.id === buildingId)!;
      return L.latLng(b.latitude, b.longitude);
    }
    let best = list[0], bestD = Infinity;
    list.forEach((e) => {
      const [lng, lat] = e.location.coordinates;
      const d = fromLL.distanceTo([lat, lng]);
      if (d < bestD) { bestD = d; best = e; }
    });
    const [lng, lat] = best.location.coordinates;
    return L.latLng(lat, lng);
  };

  const bestEntranceByGraphDistance = async (
    buildingId: string,
    fromLL: L.LatLng
  ): Promise<L.LatLng> => {
    const list = entrances.filter((e) => e.building_id === buildingId);
    if (!list.length) {
      const b = buildings.find((x: any) => x.id === buildingId)!;
      return L.latLng(b.latitude, b.longitude);
    }

    const ready = await waitForGraphReady();
    if (!ready) return bestEntranceByStraightDistance(buildingId, fromLL);

    let best: { ll: L.LatLng; dist: number } | null = null;
    for (const e of list) {
      const [lng, lat] = e.location.coordinates;
      const target = L.latLng(lat, lng);
      const path = routeOnCampus(fromLL, target);
      if (path && path.length >= 2) {
        let acc = 0;
        for (let i = 1; i < path.length; i++) acc += path[i - 1].distanceTo(path[i]);
        if (!best || acc < best.dist) best = { ll: target, dist: acc };
      }
    }
    return best?.ll ?? bestEntranceByStraightDistance(buildingId, fromLL);
  };

  /* ---------------- TTS ---------------- */
  const speakAll = (texts: string[], lang = "es-ES") => {
    if (!("speechSynthesis" in window)) {
      toast("Tu navegador no soporta voz.");
      return;
    }
    try {
      window.speechSynthesis.cancel();
    } catch {}
    if (!texts || texts.length === 0) return;
    const txt = texts.join(". ");
    const u = new SpeechSynthesisUtterance(txt);
    u.lang = lang;
    u.rate = 1;
    u.onend = () => setTtsPlaying(false);
    u.onerror = () => {
      setTtsPlaying(false);
      try {
        window.speechSynthesis.cancel();
      } catch {}
    };
    utteranceRef.current = u;
    try {
      window.speechSynthesis.speak(u);
      setTtsPlaying(true);
    } catch {
      setTtsPlaying(false);
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
    try {
      window.speechSynthesis.cancel();
    } catch {}
    setTtsPlaying(false);
    utteranceRef.current = null;
  };

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

  const drawFootRoute = async (fromLL: L.LatLng, toLL: L.LatLng, roomInfo?: Room) => {
    if (!mapRef.current) return;

    // limpiar controles/capas anteriores
    if (routingRef.current && mapRef.current) {
      try { mapRef.current.removeControl(routingRef.current); } catch {}
    }
    routingRef.current = null;

    if (routeLayerRef.current && mapRef.current) {
      try { mapRef.current.removeLayer(routeLayerRef.current); } catch {}
    }
    routeLayerRef.current = null;

    await waitForGraphReady();
    setRouteActive(true);
    setStepsOpen(false);

    const campusPath = routeOnCampus(fromLL, toLL);
    if (campusPath && campusPath.length >= 2) {
      const layer = L.polyline(campusPath, { weight: 6, opacity: 0.98, color: "#1565c0" });
      routeLayerRef.current = layer.addTo(mapRef.current!);
      mapRef.current!.fitBounds(layer.getBounds(), { padding: [60, 60], maxZoom: 19 });

      const insts = buildTurnByTurn(campusPath, toLL);
      const out = (() => {
        const base = [...insts];
        if ((roomInfo as any)?.floor?.floor_number != null)
          base.push(`El destino está en el piso ${(roomInfo as any).floor.floor_number}.`);
        const d = ((roomInfo as any)?.directions || "").trim?.() ?? "";
        if (d) base.push(`Indicaciones adicionales: ${d}`);
        return base;
      })();

      setSteps(out);
      routePathRef.current = campusPath;
      triggerPtsRef.current = computeTurnPoints(campusPath);
      setStepsOpen(true);
      speakAll(out);
      return;
    }

    // === Diagnóstico antes del error ===
    try {
      const { G, segments } = ensureGraphWithSegments();
      console.debug("Grafo peatonal:", { nodes: G.size, segments: segments.length, from: fromLL, to: toLL });
    } catch {}

    toast.error("No se encontró una ruta peatonal habilitada hacia el destino usando footways.");
    setSteps([]);
    routePathRef.current = null;
    triggerPtsRef.current = [];
    setStepsOpen(false);
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
      } catch {}
    };
    const id = setInterval(check, 2000);
    return () => clearInterval(id);
  }, [routeActive, userLoc, steps]);

  const clearRouteLayers = () => {
    if (!mapRef.current) return;
    if (routingRef.current)
      try {
        mapRef.current.removeControl(routingRef.current);
      } catch {}
    routingRef.current = null;
    if (routeLayerRef.current)
      try {
        mapRef.current.removeLayer(routeLayerRef.current);
      } catch {}
    routeLayerRef.current = null;
    if (buildingNoteRef.current)
      try {
        mapRef.current.removeLayer(buildingNoteRef.current);
      } catch {}
    buildingNoteRef.current = null;
    setSteps([]);
    setRouteActive(false);
    setStepsOpen(false);
  };

  /* ----------------- Route fetching / play flow ----------------- */
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

  const fetchRouteSteps = async (routeId: string): Promise<RouteStep[]> => {
    const { data, error } = await (supabase as any)
      .from("route_steps")
      .select(
        "id,route_id,order_index,custom_instruction,room_id,landmark_id,entrance_id,footway_id,parking_id"
      )
      .eq("route_id", routeId)
      .order("order_index", { ascending: true });
    if (error) {
      console.error(error);
      return [];
    }
    return data || [];
  };

  const latlngAndMetaOfStep = async (st: RouteStep) => {
    if (st.room_id) {
      const { data: room } = await (supabase as any)
        .from("rooms")
        .select(
          "id,floor_id,name,room_number,description,directions,image_url,map_image_path,room_type_id"
        )
        .eq("id", st.room_id)
        .single();
      if (!room) return { ll: null, building: null, room: null };
      const { data: floor } = await (supabase as any)
        .from("floors")
        .select("id,building_id,floor_number")
        .eq("id", room.floor_id)
        .single();
      if (!floor) return { ll: null, building: null, room: null };
      const { data: building } = await (supabase as any)
        .from("buildings")
        .select("id,name,latitude,longitude,image_url,map_image_path")
        .eq("id", floor.building_id)
        .single();
      if (!building) return { ll: null, building: null, room: null };

      const resolvedBuildingImg = await resolvePublicImageUrl(
        building.image_url || building.map_image_path || null
      );
      const resolvedRoomImg = await resolvePublicImageUrl(
        room.image_url || room.map_image_path || null
      );

      const fullRoom: Room = {
        ...room,
        floor: { id: floor.id, floor_number: floor.floor_number },
        image_url: resolvedRoomImg || room.image_url || null,
      };
      const fullBuilding: Building = {
        ...building,
        image_url: resolvedBuildingImg || building.image_url || null,
      };

      return {
        ll: L.latLng(building.latitude, building.longitude),
        building: fullBuilding,
        room: fullRoom,
      };
    }

    if (st.landmark_id) {
      const { data: lm } = await (supabase as any)
        .from("landmarks")
        .select("location,building_id,name,type")
        .eq("id", st.landmark_id)
        .single();
      if (!lm?.location?.coordinates) return { ll: null, building: null, room: null };
      const [lng, lat] = lm.location.coordinates;
      let building = null;
      if (lm.building_id) {
        const { data: b } = await (supabase as any)
          .from("buildings")
          .select("id,name,latitude,longitude,image_url,map_image_path")
          .eq("id", lm.building_id)
          .single();
        if (b) {
          const resolved = await resolvePublicImageUrl(b.image_url || b.map_image_path || null);
          building = { ...b, image_url: resolved || b.image_url || null };
        }
      }
      return { ll: L.latLng(lat, lng), building, room: null };
    }

    if (st.entrance_id) {
      const { data: en } = await (supabase as any)
        .from("entrances")
        .select("location,building_id")
        .eq("id", st.entrance_id)
        .single();
      if (!en?.location?.coordinates) return { ll: null, building: null, room: null };
      const [lng, lat] = en.location.coordinates;
      let building = null;
      if (en.building_id) {
        const { data: b } = await (supabase as any)
          .from("buildings")
          .select("id,name,latitude,longitude,image_url,map_image_path")
          .eq("id", en.building_id)
          .single();
        if (b) {
          const resolved = await resolvePublicImageUrl(b.image_url || b.map_image_path || null);
          building = { ...b, image_url: resolved || b.image_url || null };
        }
      }
      return { ll: L.latLng(lat, lng), building, room: null };
    }

    return { ll: null, building: null, room: null };
  };

  const prevBuildingIdRef = useRef<string | null>(null);
  const prevFloorNumberRef = useRef<number | null>(null);

  const playCurrentRouteStepIndex = async (idx: number, routeObj: Route, stepsArr: RouteStep[]) => {
    if (!userLoc) {
      toast.error("Activa el GPS para trazar el recorrido.");
      return;
    }
    clearRouteLayers();

    const st = stepsArr[idx];
    const meta = await latlngAndMetaOfStep(st);
    if (!meta.ll) {
      toast.message("Paso sin geolocalización. Avanza al siguiente.");
      return;
    }

    setCurrentStepBuilding(meta.building || null);
    setCurrentStepRoom(meta.room || null);

    const currentBuildingId = meta.building?.id || null;
    const prevBuildingId = prevBuildingIdRef.current;
    const prevFloorNumber = prevFloorNumberRef.current;
    const currentFloorNumber = (meta.room as any)?.floor?.floor_number ?? null;
    const isSameBuilding = prevBuildingId && currentBuildingId && prevBuildingId === currentBuildingId;
    const isSameFloor =
      isSameBuilding && prevFloorNumber != null && currentFloorNumber != null && prevFloorNumber === currentFloorNumber;

    if (isSameBuilding && (meta.room || st.custom_instruction)) {
      const linesBase: string[] = [];
      if (!isSameFloor && (meta.room as any)?.floor?.floor_number != null)
        linesBase.push(`Sube al piso ${(meta.room as any).floor.floor_number}.`);
      if (st.custom_instruction) linesBase.push(st.custom_instruction);
      if (meta.building?.name) linesBase.unshift(`Edificio: ${meta.building.name}.`);
      if ((meta.room as any)?.name)
        linesBase.push(
          `Destino: ${(meta.room as any).name}${
            (meta.room as any).room_number ? ` · ${(meta.room as any).room_number}` : ""
          }.`
        );
      setSteps(linesBase);
      setRouteActive(true);
      setStepsOpen(true);
      speakReset();
      if (linesBase.length) speakAll(linesBase);
      prevBuildingIdRef.current = currentBuildingId;
      prevFloorNumberRef.current = currentFloorNumber;
      return;
    }

    const from = L.latLng(userLoc.lat, userLoc.lng);
    await drawFootRoute(from, meta.ll, (meta.room as any) || undefined);

    const header: string[] = [];
    if (meta.building?.name) header.push(`Edificio: ${meta.building.name}.`);
    if ((meta.room as any)?.name)
      header.push(
        `Destino: ${(meta.room as any).name}${
          (meta.room as any).room_number ? ` · ${(meta.room as any).room_number}` : ""
        }.`
      );
    setSteps((prev) => header.concat(prev));
    setRouteActive(true);
    setStepsOpen(true);
    speakReset();
    prevBuildingIdRef.current = currentBuildingId;
    prevFloorNumberRef.current = currentFloorNumber;
  };

  const handleLogout = async (): Promise<void> => {
    try {
      await supabase.auth.signOut();
      localStorage.removeItem("appUser");
      toast.success("Sesión cerrada");
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo cerrar sesión");
    } finally {
      try {
        window.location.assign("/login");
      } catch {
        window.location.href = "/login";
      }
    }
  };

  // --- FUNCIÓN CORRECTA PARA CAMBIAR CONTRASEÑA (LOGUEADO) ---
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newPassword || newPassword.length < 8) {
      toast.error("La contraseña debe tener al menos 8 caracteres.");
      return;
    }

    setLoadingPw(true);
    try {
      // ESTA ES LA FUNCIÓN CORRECTA
      const { error } = await supabase.auth.updateUser({
        password: newPassword, // La nueva contraseña del <Input>
      });
      // NO USA resetPasswordForEmail()

      if (error) throw error;

      toast.success("Contraseña actualizada con éxito.");
      setNewPassword(""); // Limpia el campo
      setChangePwOpen(false); // Cierra el modal
    } catch (err: any) {
      toast.error(err.message || "No se pudo actualizar la contraseña.");
    } finally {
      setLoadingPw(false);
    }
  };

  /* ----------------- UI render ----------------- */
  return (
    <div className="relative h-screen w-full overflow-hidden" style={{ backgroundColor: "#0b1a22" }}>
      {/* audio notificación */}
      <audio ref={audioRef} src="/notif.mp3" preload="auto" />

      {/* ===== Header ===== */}
      <header
        className="absolute top-0 left-0 right-0 z-[3000] shadow-lg border-b"
        style={{ backgroundColor: P7463, color: "white", borderColor: "rgba(255,255,255,0.12)" }}
      >
        <div className="flex items-center justify-between px-4 py-3 gap-3">
          <div className="flex items-center space-x-3">
            <button
              className="md:hidden inline-flex items-center justify-center w-10 h-10 rounded-lg bg-white/10 ring-1 ring-white/20"
              onClick={() => setPermOpen(true)}
              aria-label="Permisos de GPS y notificaciones"
              title="Permisos de GPS y notificaciones"
            >
              <Menu className="h-5 w-5" />
            </button>


            {/* MapPin → abre Centro de permisos */}
            <button
              className="hidden md:flex w-9 h-9 rounded-lg items-center justify-center ring-1"
              style={{ backgroundColor: "rgba(255,255,255,0.1)", borderColor: "rgba(255,255,255,0.2)" }}
              onClick={() => setPermOpen(true)}
              aria-label="Permisos de GPS y notificaciones"
              title="Permisos de GPS y notificaciones"
            >
              <MapPin className="h-5 w-5" />
            </button>

            <div>
              <h1 className="font-semibold text-base leading-tight">UNEMI Campus · Admin V 2.0</h1>
              <p className="text-[11px] opacity-80">Universidad Estatal de Milagro</p>
            </div>
          </div>

          <div
            className="hidden md:flex items-center text-sm font-medium tracking-widest"
            style={{ color: "rgba(255,255,255,0.9)" }}
          >
            {clock}
          </div>

          <div className="flex items-center gap-2">
            <button
              className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-white/10 ring-1 ring-white/20 relative"
              aria-label="Notificaciones"
              onClick={() => {
                setNotifOpen((s) => {
                  const next = !s;
                  if (next) void refreshNotifications();
                  return next;
                });
              }}
            >
              <Bell className="h-5 w-5" />
              {enrichedNotifs.length > 0 && (
                <span className="absolute -top-1 -right-1 text-[10px] px-1.5 py-0.5 rounded-full bg-red-500 text-white">
                  {Math.min(9, enrichedNotifs.length)}
                  {enrichedNotifs.length > 9 ? "+" : ""}
                </span>
              )}
            </button>

            <button
              className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-white/10 ring-1 ring-white/20"
              onClick={() => setPanelOpen((s) => !s)}
              aria-label="Abrir panel de usuario"
            >
              <UserCircle2 className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      {/* ===== Mapa ===== */}
      <div className="absolute inset-0 pt-12 z-[0]">
        <div ref={mapContainer} className="w-full h-full" />
        {/* Leyenda de estilos */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[3200]">
          <div className="rounded-md border bg-white/90 backdrop-blur px-3 py-2 shadow">
            <div className="text-xs font-semibold mb-1 text-slate-700">Leyenda</div>

            <div className="grid grid-cols-2 gap-x-10 gap-y-2 text-xs">
              <div className="flex items-center gap-2">
                <span style={{ width: 22, height: 3, background: "#2E7D32" }} />
                <span>Calle peatonal</span>
              </div>
              <div className="flex items-center gap-2">
                <span style={{ width: 22, height: 3, background: "#1565C0" }} />
                <span>Calle vehicular</span>
              </div>
              <div className="flex items-center gap-2">
                <span style={{ width: 22, height: 3, background: "#00897B" }} />
                <span>Calle mixta</span>
              </div>

              <div className="flex items-center gap-2">
                <span style={{ width: 10, height: 10, background: "#2E7D32", borderRadius: 999 }} />
                <span>Entrada peatonal</span>
              </div>
              <div className="flex items-center gap-2">
                <span style={{ width: 10, height: 10, background: "#1565C0", borderRadius: 999 }} />
                <span>Entrada vehicular</span>
              </div>
              <div className="flex items-center gap-2">
                <span style={{ width: 10, height: 10, background: "#00897B", borderRadius: 999 }} />
                <span>Entrada mixta</span>
              </div>

              <div className="flex items-center gap-2">
                <span style={{ width: 10, height: 10, background: "#455A64", borderRadius: 999 }} />
                <span>Parqueadero vehículos</span>
              </div>
              <div className="flex items-center gap-2">
                <span style={{ width: 10, height: 10, background: "#F57C00", borderRadius: 999 }} />
                <span>Parqueadero motos</span>
              </div>
              <div className="flex items-center gap-2">
                <span style={{ width: 10, height: 10, background: "#1976D2", borderRadius: 999 }} />
                <span>Parqueadero discapacitados</span>
              </div>
              <div className="flex items-center gap-2">
                <span style={{ width: 10, height: 10, background: "#5E35B1", borderRadius: 999 }} />
                <span>Parqueadero mixto</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ===== Panel lateral (sobre el mapa) ===== */}
      <aside
        className={[
          "fixed top-12 bottom-0 left-0 w-[88vw] max-w-[360px] md:w-[360px] z-[4000]",
          "bg-white/95 backdrop-blur border-r border-black/10 shadow-xl",
          "transition-transform duration-200 ease-out",
          panelOpen ? "translate-x-0" : "-translate-x-full md:-translate-x-full",
        ].join(" ")}
        style={{ pointerEvents: "auto" }}
      >
        <div className="h-full flex flex-col">
          <div className="px-4 py-3 border-b border-black/10 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-black/5 flex items-center justify-center">
                <UserCircle2 className="w-5 h-5" />
              </div>
              <div className="leading-tight">
                <div className="font-semibold text-slate-800">
                  {displayName || appUser?.usuario || appUser?.email || "Usuario"}
                </div>

              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="text-xs font-mono text-slate-600 hidden sm:block">{clock}</div>
              <button
                className="w-9 h-9 grid place-items-center rounded-lg hover:bg-black/5"
                onClick={() => setPanelOpen(false)}
                aria-label="Cerrar panel"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-auto px-4 py-4 space-y-4">
            <div className="text-sm text-slate-600">
              <div>
                <span className="text-slate-500">Dirección:</span>{" "}
                {direccion || appUser?.direccion || "—"}
              </div>
            </div>

            <div className="grid gap-2">
              <Label className="text-xs">Acciones de cuenta</Label>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={handleOpenPasswordModal} // <-- Abre el modal
                >
                  <KeyRound className="mr-2 h-4 w-4" />
                  Cambiar Contraseña
                </Button>
                <Button size="sm" variant="destructive" onClick={handleLogout}>
                  <LogOut className="w-4 h-4 mr-2" /> Salir
                </Button>
              </div>
              
            </div>

            <div className="grid gap-2">
              <Label className="text-xs">Capas visibles</Label>
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">Edificios</Badge>
                <Badge variant="secondary">Calles peatonales</Badge>
                <Badge variant="secondary">Entradas</Badge>
                <Badge variant="secondary">Parqueaderos</Badge>
              </div>
             
            </div>
          </div>
        </div>
      </aside>

      {/* ===== Drawer de notificaciones (derecha) ===== */}
      <aside
        className={[
          "fixed top-12 bottom-0 right-0 w-[88vw] max-w-[380px] z-[4000]",
          "bg-white/95 backdrop-blur border-l border-black/10 shadow-xl",
          "transition-transform duration-200 ease-out",
          notifOpen ? "translate-x-0" : "translate-x-full",
        ].join(" ")}
        aria-label="Centro de notificaciones"
      >
        <div className="h-full flex flex-col">
          {/* Header del panel de notificaciones */}
          <div className="px-4 py-3 border-b border-black/10 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 grid place-items-center rounded-lg bg-black/5">
                <Bell className="w-5 h-5" />
              </div>
              <div className="leading-tight">
                <div className="font-semibold text-slate-800">Centro de notificaciones</div>
                <div className="text-xs text-slate-500">Últimas 24 horas, filtradas por tu rol</div>
              </div>
            </div>
            <button
              className="w-9 h-9 grid place-items-center rounded-lg hover:bg-black/5"
              onClick={() => setNotifOpen(false)}
              aria-label="Cerrar notificaciones"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Contenido scrollable */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            {enrichedNotifs.length === 0 ? (
              <Card className="p-4 text-sm text-muted-foreground">
                No hay notificaciones recientes para tu rol.
              </Card>
            ) : (
              enrichedNotifs.map((n) => (
                <Card key={n.id} className="border">
                  <CardContent className="py-4">
                    <div className="grid grid-cols-[1fr_auto] items-start gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold leading-snug text-[15px] break-words hyphens-auto line-clamp-2">
                            {n.viewTitle}
                          </span>
                          <Badge
                            variant={
                              n.severity === "error"
                                ? "destructive"
                                : n.severity === "warning"
                                ? "secondary"
                                : "default"
                            }
                          >
                            {n.severity ?? "info"}
                          </Badge>
                          <Badge variant="outline" className="capitalize">
                            {(n.entity_table ?? "evento").toString()}
                          </Badge>
                        </div>

                        {n.viewBody && (
                          <p className="mt-1 text-[13px] text-muted-foreground leading-snug break-words hyphens-auto">
                            {n.viewBody}
                          </p>
                        )}

                        {n.reason && (
                          <p className="mt-2 text-[12px] text-muted-foreground leading-snug break-words hyphens-auto">
                            <span className="font-medium">Motivo:</span> {n.reason}
                          </p>
                        )}
                      </div>

                      <span className="shrink-0 text-[12px] text-muted-foreground whitespace-nowrap">
                        {new Date(n.created_at).toLocaleString()}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </div>
      </aside>

      {/* ===== Buscador card ===== */}
      {!routeActive && (
        <Card className="absolute top-16 left-4 right-4 md:left-4 md:right-auto md:w-[820px] z-[3500] p-3 shadow-xl border-border/60 bg-white/95 backdrop-blur">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm text-slate-600">
              Escribe tu destino y te llevaré por la vía <b>más corta</b> a la entrada más cercana.
            </div>
          </div>

          <form
            className="flex gap-2 items-end"
            onSubmit={(e) => {
              e.preventDefault();
              handleSearch();
            }}
          >
            <div className="flex-1">
              <Label className="text-xs">¿A dónde quieres ir?</Label>
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder='Ej: "Aula 201", "Bloque CRAI", "plazoleta" o nombre de un recorrido'
              />
            </div>
            <Button type="button" onClick={() => handleSearch()}>
              <Search className="w-4 h-4 mr-2" /> Buscar
            </Button>
          </form>
        </Card>
      )}

      {/* ===== Imagen primer edificio (opcional) ===== */}
      {firstRouteBuildingImage && (
        <div className="absolute top-14 right-3 z-[3500]">
          <div className="rounded-md border bg-white/90 backdrop-blur px-3 py-2 shadow max-w-xs">
            <div className="text-xs text-slate-600">Imagen inicio del recorrido</div>
            <div className="mt-2 w-40 h-24 rounded overflow-hidden border bg-slate-100">
              <img
                src={firstRouteBuildingImage}
                alt="Primer edificio"
                className="w-full h-full object-cover"
                onError={(e: any) => {
                  e.currentTarget.style.display = "none";
                }}
              />
            </div>
            <div className="mt-2 flex gap-2">
              <Button size="sm" onClick={() => setStepsOpen(true)}>
                Ver pasos
              </Button>
              <Button size="sm" variant="outline" onClick={() => setFirstRouteBuildingImage(null)}>
                Ocultar
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ===== DIALOG: instrucciones ===== */}
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
          <DialogOverlay className="fixed inset-0 z-[5000] bg-black/50 backdrop-blur-sm" />
          <DialogContent
            className="z-[5001] p-0 max-w-none w-[100vw] sm:w-[720px] h-[85vh] sm:h-auto sm:max-h-[88vh] overflow-hidden"
            style={{ display: "flex", flexDirection: "column" }}
          >
            <div className="flex-1 overflow-auto">
              <DialogHeader className="px-5 pt-4">
                <DialogTitle>Instrucciones del recorrido</DialogTitle>
                <DialogDescription>
                  Te guío por la ruta <b>más corta</b>. Activa el GPS para una mejor precisión.
                </DialogDescription>
              </DialogHeader>

              <div className="px-5 pb-3 flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => speakAll(steps)}>
                  ▶️ Leer
                </Button>
                <Button size="sm" variant="outline" onClick={speakPause}>
                  {ttsPlaying ? "⏸️ Pausar" : "⏯️ Reanudar"}
                </Button>
                <div className="flex-1" />
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setStepsOpen(false);
                    speakReset();
                  }}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>

              <div className="px-5 pb-2">
                <ol className="list-decimal pl-5 space-y-2 text-sm">
                  {steps.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ol>
              </div>

              <div className="px-5 pb-8">
                {currentStepBuilding?.image_url && (
                  <div className="mb-4">
                    <div className="text-sm text-slate-600 mb-2">Imagen del edificio</div>
                    <div className="rounded-lg border bg-slate-50 p-2">
                      <img
                        src={currentStepBuilding.image_url}
                        alt="Edificio"
                        className="w-full max-h-[320px] object-contain rounded-md"
                        onError={(e: any) => {
                          e.currentTarget.style.display = "none";
                        }}
                      />
                    </div>
                  </div>
                )}

                {currentStepRoom?.image_url && (
                  <div>
                    <div className="text-sm text-slate-600 mb-2">Imagen del espacio</div>
                    <div className="rounded-lg border bg-slate-50 p-2">
                      <img
                        src={currentStepRoom.image_url}
                        alt="Espacio"
                        className="w-full max-h-[420px] object-contain rounded-md"
                        onError={(e: any) => {
                          e.currentTarget.style.display = "none";
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            <DialogFooter className="flex items-center justify-between px-5 py-3">
              <div className="text-xs text-slate-500">
                Sigue las indicaciones y mantente atento al GPS.
              </div>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setStepsOpen(false);
                    speakReset();
                  }}
                >
                  Cerrar
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </DialogPortal>
      </Dialog>

      {/* Botón flotante: Ver pasos */}
      {routeActive && steps.length > 0 && !stepsOpen && (
        <div className="absolute bottom-4 right-4 z-[3500]">
          <Button size="lg" onClick={() => setStepsOpen(true)}>
            Ver pasos
          </Button>
        </div>
      )}

      {/* Botón flotante: Nueva consulta */}
      {routeActive && (
        <div className="absolute bottom-4 left-4 z-[3500]">
          <Button
            size="lg"
            variant="secondary"
            onClick={() => {
              try {
                if (routingRef.current && mapRef.current)
                  mapRef.current.removeControl(routingRef.current);
              } catch {}
              routingRef.current = null;
              try {
                if (routeLayerRef.current && mapRef.current)
                  mapRef.current.removeLayer(routeLayerRef.current);
              } catch {}
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
            }}
          >
            <PanelTopOpen className="w-5 h-5 mr-2" /> Nueva consulta
          </Button>
        </div>
      )}

      {/* === MODAL PARA CAMBIAR CONTRASEÑA === */}
      <Dialog open={changePwOpen} onOpenChange={setChangePwOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Cambiar contraseña</DialogTitle>
            <DialogDescription>
              Ingresa tu nueva contraseña. Debe tener al menos 8 caracteres.
            </DialogDescription>
          </DialogHeader>
          {/* El formulario llama a la función CORRECTA */}
          <form onSubmit={handleChangePassword}>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="new-password" className="text-right">
                  Nueva Contraseña
                </Label>
                <Input
                  id="new-password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  className="col-span-3"
                  required
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setChangePwOpen(false)}
                disabled={loadingPw}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={loadingPw}>
                {loadingPw ? "Guardando..." : "Guardar cambios"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ===== Resultados de búsqueda ===== */}
      <Dialog open={resultsOpen} onOpenChange={setResultsOpen}>
        <DialogPortal>
          <DialogOverlay className="fixed inset-0 z-[5000] bg-black/50 backdrop-blur-sm" />
        </DialogPortal>
        <DialogContent className="z-[5001] p-0 max-w-none w-[92vw] sm:w-[640px] h-[86vh] overflow-auto">
          <div className="px-5 pt-4">
            <DialogHeader>
              <DialogTitle>Resultados de búsqueda</DialogTitle>
              <DialogDescription>Selecciona el resultado al que quieres ir.</DialogDescription>
            </DialogHeader>
          </div>

          <div className="px-5 pb-6 overflow-auto">
            <div className="flex flex-col gap-4 mt-4">
              {searchResults.map((h) => {
                if (h.kind === "room") {
                  const r = h.room as any;
                  const block = r.building_name ?? "Bloque";
                  const piso = r.floor?.floor_number ? `Piso ${r.floor.floor_number}` : "";
                  const tipo = r.room_type_name ?? "";
                  return (
                    <div key={r.id} className="p-4 border rounded-lg bg-white">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-lg font-semibold">{r.name}</div>
                          <div className="text-sm text-slate-600 mt-1">
                            {block} · {piso} · {tipo}
                          </div>
                        </div>
                        <div>
                          <Button
                            size="sm"
                            onClick={async () => {
                              setResultsOpen(false);
                              await focusRoom(r);
                            }}
                          >
                            Ir
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                } else if (h.kind === "landmark") {
                  const lm = h.landmark as any;
                  return (
                    <div key={lm.id} className="p-4 border rounded-lg bg-white">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-lg font-semibold">{lm.name ?? lm.type}</div>
                          <div className="text-sm text-slate-600 mt-1">{lm.type}</div>
                        </div>
                        <div>
                          <Button
                            size="sm"
                            onClick={async () => {
                              setResultsOpen(false);
                              await focusLandmark(lm);
                            }}
                          >
                            Ir
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                } else {
                  const b = (h as HitBuilding).building as any;
                  return (
                    <div key={b.id} className="p-4 border rounded-lg bg-white">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-lg font-semibold">{b.name}</div>
                          <div className="text-sm text-slate-600 mt-1">
                            Bloque · {b.building_code ?? ""}
                          </div>
                        </div>
                        <div>
                          <Button
                            size="sm"
                            onClick={() => {
                              setResultsOpen(false);
                              handleSelectBuilding(b, true);
                            }}
                          >
                            Ir
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                }
              })}
            </div>
          </div>

          <div className="px-5 pb-5">
            <div className="flex justify-end">
              <Button variant="outline" onClick={() => setResultsOpen(false)}>
                Cerrar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <PermissionsCenter
        open={permOpen}
        onOpenChange={setPermOpen}
        onRestartWatch={() => {
          try {
            if (!("geolocation" in navigator)) return;
            navigator.geolocation.getCurrentPosition(
              (pos) => {
                const ll = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                setUserLoc(ll);
                setOrUpdateTigerMarker(ll, mapRef, userMarkerRef);
              },
              () => setGpsDenied(true),
              { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
            );
          } catch {}
        }}
      />
    </div>
  );
}
