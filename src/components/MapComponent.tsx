// src/components/MapComponent.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import * as L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet-draw/dist/leaflet.draw.css";

import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

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

type BuildingState = "HABILITADO" | "REPARACIÓN";
type Building = {
  id: string;
  name: string;
  description: string | null;
  latitude: number;
  longitude: number;
  total_floors: number;
  building_code: string | null;
  state: BuildingState; // NEW
};

type FootwayState = "ABIERTO" | "CERRADO";
type Footway = {
  id: string;
  name: string | null;
  state: FootwayState;
  geom: { type: "LineString"; coordinates: [number, number][] }; // [lng,lat]
};

export type EntranceType = "pedestrian" | "vehicular" | "both";
type Entrance = {
  id: string;
  building_id: string | null;
  name: string | null;
  type: EntranceType;
  location: { type: "Point"; coordinates: [number, number] };
};

export type ParkingType = "car" | "motorcycle" | "disabled" | "mixed";
type Parking = {
  id: string;
  building_id: string | null;
  name: string | null;
  type: ParkingType;
  capacity: number | null;
  location: { type: "Point"; coordinates: [number, number] };
};

export type LandmarkType = "plazoleta" | "bar" | "corredor" | "otro";
type Landmark = {
  id: string;
  name: string | null;
  type: LandmarkType;
  location: { type: "Point"; coordinates: [number, number] };
};

export type MapClickCoords = { latitude: number; longitude: number };
type MapMode = "idle" | "footwayAB" | "entrance" | "parking" | "landmark";

export interface MapComponentProps {
  onLocationSelect?: (location: any) => void;
  onAddBuilding?: (coords: MapClickCoords) => void;
  isAdmin?: boolean;

  /** control externo (Index) */
  externalMode?: MapMode;
  entranceType?: EntranceType;
  landmarkType?: LandmarkType;
  onModeReset?: () => void;
}

const UNEMI_CENTER: [number, number] = [-2.14898719, -79.60420553];
const SNAP_PX = 10;

const MapComponent: React.FC<MapComponentProps> = ({
  onLocationSelect,
  onAddBuilding,
  isAdmin = false,
  externalMode = "idle",
  entranceType = "pedestrian",
  landmarkType = "plazoleta",
  onModeReset,
}) => {
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);

  const [buildings, setBuildings] = useState<Building[]>([]);
  const markersRef = useRef<L.Marker[]>([]);

  // Capa de edición / render
  const drawnLayerGroupRef = useRef<L.FeatureGroup | null>(null);
  const drawControlRef = useRef<any>(null);

  // Datos
  const [footways, setFootways] = useState<Footway[]>([]);
  const [entrances, setEntrances] = useState<Entrance[]>([]);
  const [parkings, setParkings] = useState<Parking[]>([]);
  const [landmarks, setLandmarks] = useState<Landmark[]>([]);

  // Modo (desde Index)
  const modeRef = useRef<MapMode>("idle");
  const [mode, setMode] = useState<MapMode>("idle");
  const entranceTypeRef = useRef<EntranceType>(entranceType);
  const landmarkTypeRef = useRef<LandmarkType>(landmarkType);

  // A→B para footway
  const pointAMarkerRef = useRef<L.Marker | null>(null);
  const pointBMarkerRef = useRef<L.Marker | null>(null);
  const quickARef = useRef<L.LatLng | null>(null);
  const quickBRef = useRef<L.LatLng | null>(null);

  // === panel flotante para crear POIs (sin prompts) ===
  type PendingForm =
    | { kind: "entrance" | "parking" | "landmark"; latlng: L.LatLng; name: string; buildingId: string | null }
    | null;
  const [pending, setPending] = useState<PendingForm>(null);

  // === contexto de acciones (clic sobre calle/edificio/entrada) ===
  type CtxMenu =
    | { kind: "footway"; id: string; latlng: L.LatLng; screen: { x: number; y: number }; state: FootwayState }
    | { kind: "building"; id: string; latlng: L.LatLng; screen: { x: number; y: number }; state: BuildingState }
    | { kind: "entrance"; id: string; latlng: L.LatLng; screen: { x: number; y: number } }
    | null;
  const [ctx, setCtx] = useState<CtxMenu>(null);

  // ======= ENTRANCE drag handling =======
  const entranceMarkersRef = useRef<Map<string, L.Marker>>(new Map());
  const [dragEditing, setDragEditing] = useState<{ id: string; original: L.LatLng } | null>(null);

  // --- carga ---
  const loadBuildings = async () => {
    const { data, error } = await supabase
      .from("buildings")
      .select("id,name,description,latitude,longitude,total_floors,building_code,state")
      .order("name", { ascending: true });
    if (error) { console.error(error); toast.error("Error cargando edificios"); return; }
    setBuildings((data || []) as Building[]);
  };

  const loadFootways = async () => {
    const { data, error } = await supabase.from("footways").select("id,name,state,geom");
    if (error) { console.error(error); toast.error("Error cargando calles"); return; }
    setFootways((data || []) as Footway[]);
  };

  const loadEntrances = async () => {
    const { data, error } = await supabase
      .from("entrances")
      .select("id,building_id,name,type,location");
    if (error) { console.error(error); toast.error("Error cargando puertas"); return; }
    setEntrances((data || []) as Entrance[]);
  };

  const loadParkings = async () => {
    const { data, error } = await supabase
      .from("parkings")
      .select("id,building_id,name,type,capacity,location");
    if (error) { console.error(error); toast.error("Error cargando parqueaderos"); return; }
    setParkings((data || []) as Parking[]);
  };

  const loadLandmarks = async () => {
    const { data, error } = await supabase
      .from("landmarks")
      .select("id,name,type,location");
    if (error) { console.error(error); toast.error("Error cargando puntos de referencia"); return; }
    setLandmarks((data || []) as Landmark[]);
  };

  // ======== SNAP ========
  const getAllVertices = (): L.LatLng[] => {
    const arr: L.LatLng[] = [];
    for (const fw of footways) {
      for (const [lng, lat] of fw.geom?.coordinates || []) {
        if (isFinite(lat) && isFinite(lng)) arr.push(L.latLng(lat, lng));
      }
    }
    return arr;
  };

  const snapLatLngToVertex = (ll: L.LatLng): L.LatLng => {
    if (!mapRef.current) return ll;
    const map = mapRef.current;
    const clickPt = map.latLngToLayerPoint(ll);
    let best: { v: L.LatLng; dpx: number } | null = null;
    for (const v of getAllVertices()) {
      const pt = map.latLngToLayerPoint(v);
      const dpx = Math.hypot(pt.x - clickPt.x, pt.y - clickPt.y);
      if (dpx <= SNAP_PX && (!best || dpx < best.dpx)) best = { v, dpx };
    }
    return best ? best.v : ll;
  };

  const snapLineString = (coords: [number, number][]): [number, number][] => {
    if (!mapRef.current || !coords?.length) return coords;
    return coords.map(([lng, lat]) => {
      const snapped = snapLatLngToVertex(L.latLng(lat, lng));
      return [snapped.lng, snapped.lat];
    });
  };

  // ===== Mapa =====
  useEffect(() => {
    if (!mapEl.current || mapRef.current) return;

    const map = L.map(mapEl.current, { zoomControl: true, attributionControl: true }).setView(UNEMI_CENTER, 18);
    mapRef.current = map;

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors",
      maxZoom: 20,
    }).addTo(map);

    drawnLayerGroupRef.current = L.featureGroup().addTo(map);

    addBuildingMarkers();
    renderFootways();
    renderVerticesLayer();
    renderEntrances();
    renderParkings();
    renderLandmarks();

    map.on("click", handleMapClick);

    return () => {
      if (!mapRef.current) return;
      mapRef.current.off("click", handleMapClick);
      markersRef.current.forEach((m) => mapRef.current?.removeLayer(m));
      if (drawControlRef.current) mapRef.current.removeControl(drawControlRef.current);
      if (drawnLayerGroupRef.current) mapRef.current.removeLayer(drawnLayerGroupRef.current);
      if (verticesLayerRef.current) mapRef.current.removeLayer(verticesLayerRef.current);
      // limpiar entrance markers
      for (const mk of entranceMarkersRef.current.values()) mapRef.current.removeLayer(mk);
      entranceMarkersRef.current.clear();
      mapRef.current.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-render por datos
  useEffect(() => { addBuildingMarkers(); }, [buildings]); // eslint-disable-line
  useEffect(() => { renderFootways(); renderVerticesLayer(); }, [footways, isAdmin]); // eslint-disable-line
  useEffect(() => { renderEntrances(); }, [entrances, dragEditing]); // eslint-disable-line
  useEffect(() => { renderParkings(); }, [parkings]); // eslint-disable-line
  useEffect(() => { renderLandmarks(); }, [landmarks]); // eslint-disable-line

  // cargas
  useEffect(() => {
    loadBuildings();
    loadFootways();
    loadEntrances();
    loadParkings();
    loadLandmarks();
  }, []);

  // Modo externo
  useEffect(() => {
    setMode(externalMode);
    modeRef.current = externalMode;
    entranceTypeRef.current = entranceType;
    landmarkTypeRef.current = landmarkType;

    if (externalMode === "footwayAB") {
      enableDrawControls();
      toast("Dibujar calle (A→B): usa vértices amarillos o clic libre (con snap).");
    }
  }, [externalMode, entranceType, landmarkType]);

  // ===== Render helpers =====
  const buildingStyle = (b: Building) => {
    const color = b.state === "REPARACIÓN" ? "#f59e0b" : "var(--primary)";
    return L.divIcon({
      className: "custom-building-marker",
      html: `<div style="background:${color}" class="text-primary-foreground rounded-full w-8 h-8 flex items-center justify-center text-sm font-bold shadow-lg border-2 border-background">${b.total_floors}</div>`,
      iconSize: [32, 32],
      iconAnchor: [16, 16],
    });
  };

  const addBuildingMarkers = () => {
    if (!mapRef.current) return;
    markersRef.current.forEach((m) => mapRef.current?.removeLayer(m));
    markersRef.current = [];

    buildings.forEach((b) => {
      const icon = buildingStyle(b);
      const marker = L.marker([b.latitude, b.longitude], { icon, title: b.name }).addTo(mapRef.current!);
      marker.on("click", (ev) => {
        onLocationSelect?.(b); // mantiene tu selección para el panel lateral
        ev.originalEvent.stopPropagation();
        openCtx("building", b.id, L.latLng(b.latitude, b.longitude), b.state);
      });
      markersRef.current.push(marker);
    });
  };

  const footwayStyle = (fw: Footway): L.PolylineOptions =>
    fw.state === "CERRADO"
      ? { color: "#ef4444", weight: 4, opacity: 0.9, dashArray: "6 6" }
      : { color: "#0ea5e9", weight: 4, opacity: isAdmin ? 0.95 : 0 };

  const renderFootways = () => {
    if (!drawnLayerGroupRef.current || !mapRef.current) return;
    drawnLayerGroupRef.current.clearLayers();

    footways.forEach((fw) => {
      const coords = fw.geom?.coordinates || [];
      if (!coords.length) return;
      const latlngs = coords.map(([lng, lat]) => [lat, lng]) as L.LatLngExpression[];
      const poly = L.polyline(latlngs, footwayStyle(fw)).addTo(drawnLayerGroupRef.current!);
      (poly as any).__footwayId = fw.id;

      poly.on("click", (ev: L.LeafletMouseEvent) => {
        ev.originalEvent.stopPropagation();
        openCtx("footway", fw.id, ev.latlng, fw.state);
      });
    });
  };

  // Vértices numerados (amarillo)
  const verticesLayerRef = useRef<L.LayerGroup | null>(null);
  const renderVerticesLayer = () => {
    if (!mapRef.current) return;
    if (verticesLayerRef.current) {
      verticesLayerRef.current.clearLayers();
      mapRef.current.removeLayer(verticesLayerRef.current);
    }
    verticesLayerRef.current = L.layerGroup().addTo(mapRef.current);

    let idx = 1;
    for (const fw of footways) {
      const coords = fw.geom?.coordinates || [];
      coords.forEach(([lng, lat]) => {
        const icon = L.divIcon({
          className: "vertex-pin",
          html: `<div style="background:#f59e0b;color:#111;font-weight:700" class="rounded-full w-5 h-5 text-[11px] flex items-center justify-center shadow">${idx}</div>`,
          iconSize: [20, 20],
          iconAnchor: [10, 10],
        });
        const mk = L.marker([lat, lng], { icon, interactive: true }).addTo(verticesLayerRef.current!);
        mk.on("click", (ev) => {
          ev.originalEvent.stopPropagation();
          if (modeRef.current !== "footwayAB") return;
          pickVertexAsAB(L.latLng(lat, lng));
        });
        idx++;
      });
    }
  };

  const pickVertexAsAB = async (ll: L.LatLng) => {
    if (!mapRef.current) return;
    if (!quickARef.current) {
      quickARef.current = ll;
      setABMarker("A", ll);
      toast("Punto A fijado (vértice). Haz clic para el punto B.");
      return;
    }
    if (!quickBRef.current) {
      quickBRef.current = ll;
      setABMarker("B", ll);
      const geojson = {
        type: "LineString" as const,
        coordinates: [
          [quickARef.current.lng, quickARef.current.lat],
          [quickBRef.current.lng, quickBRef.current.lat],
        ] as [number, number][],
      };
      const { error } = await supabase.from("footways").insert({ name: null, state: "ABIERTO", geom: geojson });
      if (error) { console.error(error); toast.error("No se pudo guardar la calle"); }
      else { toast.success("Calle peatonal creada"); await loadFootways(); renderFootways(); renderVerticesLayer(); }
      clearABMarkers();
      onModeReset?.();
    }
  };

  // ENTRANCES
  const renderEntrances = () => {
    if (!mapRef.current) return;

    // limpiar markers previos
    for (const mk of entranceMarkersRef.current.values()) mapRef.current!.removeLayer(mk);
    entranceMarkersRef.current.clear();

    entrances.forEach((e) => {
      const [lng, lat] = e.location.coordinates;
      const isEditing = dragEditing?.id === e.id;
      const color = e.type === "vehicular" ? "#ef4444" : e.type === "both" ? "#f59e0b" : "#10b981";
      const icon = L.divIcon({
        className: "entrance-pin",
        html: `<div style="background:${color};color:white" class="rounded-full w-5 h-5 shadow border-2 border-white"></div>`,
        iconSize: [10, 10],
        iconAnchor: [5, 5],
      });
      const mk = L.marker([lat, lng], { icon, title: e.name || `Entrada ${e.type}`, draggable: !!isEditing })
        .addTo(mapRef.current!);

      mk.on("click", (ev) => {
        ev.originalEvent.stopPropagation();
        openCtx("entrance", e.id, ev.latlng);
      });

      entranceMarkersRef.current.set(e.id, mk);
    });
  };

  const renderParkings = () => {
    if (!mapRef.current) return;
    parkings.forEach((p) => {
      const [lng, lat] = p.location.coordinates;
      const icon = L.divIcon({
        className: "parking-pin",
        html: `<div class="bg-blue-600 text-white text-[10px] font-bold rounded px-1.5 py-0.5 shadow">P</div>`,
        iconSize: [18, 14],
        iconAnchor: [9, 7],
      });
      L.marker([lat, lng], { icon, title: p.name || "Parqueadero" })
        .addTo(mapRef.current!)
        .bindPopup(`<div class="text-sm"><b>${p.name || "Parqueadero"}</b>${p.building_id ? "" : "<br/>Sin edificio"}</div>`);
    });
  };

  const renderLandmarks = () => {
    if (!mapRef.current) return;
    landmarks.forEach((l) => {
      const [lng, lat] = l.location.coordinates;
      const label =
        l.type === "plazoleta" ? "Plz" :
        l.type === "bar" ? "Bar" :
        l.type === "corredor" ? "Cor" : "Ref";
      const icon = L.divIcon({
        className: "landmark-pin",
        html: `<div class="bg-purple-600 text-white text-[10px] font-bold rounded px-1.5 py-0.5 shadow">${label}</div>`,
        iconSize: [18, 14],
        iconAnchor: [9, 7],
      });
      L.marker([lat, lng], { icon, title: l.name || `Referencia: ${l.type}` })
        .addTo(mapRef.current!)
        .bindPopup(`<div class="text-sm"><b>${l.name || "Referencia"}</b>${l.type ? `<br/>Tipo: ${l.type}` : ""}</div>`);
    });
  };

  // ===== Click mapa =====
  const handleMapClick = async (e: L.LeafletMouseEvent) => {
    let ll = e.latlng;
    ll = snapLatLngToVertex(ll);
    const activeMode = modeRef.current;

    // si hay panel pendiente o menú abierto, ciérralos y no hagas nada más
    if (pending) return;
    if (ctx) { setCtx(null); return; }

    if (activeMode === "idle") {
      onAddBuilding?.({ latitude: ll.lat, longitude: ll.lng });
      return;
    }

    if (activeMode === "footwayAB") {
      if (!quickARef.current) {
        quickARef.current = ll;
        setABMarker("A", ll);
        toast("Punto A fijado. Haz clic para el punto B o toca un vértice.");
        return;
      }
      if (!quickBRef.current) {
        quickBRef.current = ll;
        setABMarker("B", ll);
        const A = snapLatLngToVertex(quickARef.current);
        const B = snapLatLngToVertex(quickBRef.current);
        const geojson = { type: "LineString" as const, coordinates: [[A.lng, A.lat],[B.lng,B.lat]] as [number,number][] };
        const { error } = await supabase.from("footways").insert({ name: null, state: "ABIERTO", geom: geojson });
        if (error) { console.error(error); toast.error("No se pudo guardar la calle"); }
        else { toast.success("Calle peatonal creada"); await loadFootways(); renderFootways(); renderVerticesLayer(); }
        clearABMarkers();
        onModeReset?.();
      }
      return;
    }

    if (activeMode === "entrance") {
      setPending({ kind: "entrance", latlng: ll, name: "", buildingId: nearestBuildingId(ll) });
      return;
    }
    if (activeMode === "parking") {
      setPending({ kind: "parking", latlng: ll, name: "", buildingId: nearestBuildingId(ll) });
      return;
    }
    if (activeMode === "landmark") {
      setPending({ kind: "landmark", latlng: ll, name: "", buildingId: nearestBuildingId(ll) });
      return;
    }
  };

  const nearestBuildingId = (ll: L.LatLng): string | null => {
    if (!buildings.length) return null;
    const sorted = [...buildings]
      .map((b) => ({ b, d: ll.distanceTo([b.latitude, b.longitude]) }))
      .sort((a, b) => a.d - b.d);
    return sorted[0]?.b.id ?? null;
  };

  const setABMarker = (label: "A" | "B", ll: L.LatLng) => {
    if (!mapRef.current) return;
    const html = `<div class="bg-orange-600 text-white font-bold rounded-full w-8 h-8 flex items-center justify-center shadow">${label}</div>`;
    const icon = L.divIcon({ className: "p2p-pin", html, iconSize: [32, 32], iconAnchor: [16, 16] });
    const mk = L.marker(ll, { icon }).addTo(mapRef.current);
    if (label === "A") {
      if (pointAMarkerRef.current) mapRef.current.removeLayer(pointAMarkerRef.current);
      pointAMarkerRef.current = mk;
    } else {
      if (pointBMarkerRef.current) mapRef.current.removeLayer(pointBMarkerRef.current);
      pointBMarkerRef.current = mk;
    }
  };

  const clearABMarkers = () => {
    if (!mapRef.current) return;
    if (pointAMarkerRef.current) mapRef.current.removeLayer(pointAMarkerRef.current);
    if (pointBMarkerRef.current) mapRef.current.removeLayer(pointBMarkerRef.current);
    pointAMarkerRef.current = null;
    pointBMarkerRef.current = null;
    quickARef.current = null;
    quickBRef.current = null;
  };

  // Barra de dibujo para edición avanzada
  const enableDrawControls = async () => {
    if (!mapRef.current) return;
    try { if (!(L as any).Draw) await import("leaflet-draw"); }
    catch { toast.error("No se pudo cargar el módulo de dibujo"); return; }

    if (drawControlRef.current) mapRef.current.removeControl(drawControlRef.current);
    if (!drawnLayerGroupRef.current) drawnLayerGroupRef.current = L.featureGroup().addTo(mapRef.current);

    // @ts-expect-error plugin types
    drawControlRef.current = new L.Control.Draw({
      draw: {
        polyline: { shapeOptions: { color: "#0ea5e9", weight: 4, opacity: 0.95 }, metric: true, feet: false, showLength: true },
        polygon: false, rectangle: false, circle: false, circlemarker: false, marker: false,
      },
      edit: { featureGroup: drawnLayerGroupRef.current, remove: true, edit: true },
    });
    mapRef.current.addControl(drawControlRef.current);

    mapRef.current.off("draw:created");
    mapRef.current.on("draw:created", async (e: any) => {
      const layer = e.layer as L.Polyline;
      const latlngs = layer.getLatLngs() as L.LatLng[];
      if (!latlngs || latlngs.length < 2) return toast.error("La calle debe tener al menos 2 puntos.");
      const coords = latlngs.map((ll) => [ll.lng, ll.lat]) as [number, number][];
      const snapped = snapLineString(coords);
      const geojson = { type: "LineString" as const, coordinates: snapped };
      const { error } = await supabase.from("footways").insert({ name: null, state: "ABIERTO", geom: geojson });
      if (error) toast.error("No se pudo guardar la calle");
      else { toast.success("Calle guardada"); await loadFootways(); renderFootways(); renderVerticesLayer(); }
    });

    mapRef.current.off("draw:edited");
    mapRef.current.on("draw:edited", async (e: any) => {
      const layers = e.layers as L.FeatureGroup;
      try {
        const edits: any[] = []; layers.eachLayer((l: any) => edits.push(l));
        for (const layer of edits) {
          const poly = layer as L.Polyline & { __footwayId?: string };
          if (!poly.__footwayId) continue;
          const latlngs = poly.getLatLngs() as L.LatLng[];
          const coords = latlngs.map((ll) => [ll.lng, ll.lat]) as [number, number][];
          const snapped = snapLineString(coords);
          const geojson = { type: "LineString" as const, coordinates: snapped };
          const { error } = await supabase.from("footways").update({ geom: geojson }).eq("id", poly.__footwayId);
          if (error) throw error;
        }
        toast.success("Calles actualizadas");
        await loadFootways(); renderFootways(); renderVerticesLayer();
      } catch { toast.error("No se pudieron actualizar las calles"); }
    });

    mapRef.current.off("draw:deleted");
    mapRef.current.on("draw:deleted", async (e: any) => {
      const layers = e.layers as L.FeatureGroup;
      try {
        const dels: any[] = []; layers.eachLayer((l: any) => dels.push(l));
        for (const layer of dels) {
          const poly = layer as L.Polyline & { __footwayId?: string };
          if (!poly.__footwayId) continue;
          const { error } = await supabase.from("footways").delete().eq("id", poly.__footwayId);
          if (error) throw error;
        }
        toast.success("Calles eliminadas");
        await loadFootways(); renderFootways(); renderVerticesLayer();
      } catch { toast.error("No se pudieron eliminar las calles"); }
    });
  };

  // ======= UI auxiliar: lista de edificios ordenados por cercanía =======
  const sortedBuildingsFor = (ll: L.LatLng) =>
    [...buildings]
      .map((b) => ({ b, d: ll.distanceTo([b.latitude, b.longitude]) }))
      .sort((a, b) => a.d - b.d)
      .map(({ b }) => b);

  const submitPending = async () => {
    if (!pending) return;
    const ll = pending.latlng;
    const coords: [number, number] = [ll.lng, ll.lat];

    if (pending.kind === "entrance") {
      const { error } = await supabase.from("entrances").insert({
        name: pending.name || null,
        building_id: pending.buildingId,
        type: entranceTypeRef.current,
        location: { type: "Point", coordinates: coords },
      });
      if (error) return toast.error("No se pudo guardar la puerta");
      toast.success("Puerta guardada");
      await loadEntrances(); renderEntrances();
    }

    if (pending.kind === "parking") {
      const { error } = await supabase.from("parkings").insert({
        name: pending.name || null,
        building_id: pending.buildingId,
        type: "car",
        capacity: null,
        location: { type: "Point", coordinates: coords },
      });
      if (error) return toast.error("No se pudo guardar el parqueadero");
      toast.success("Parqueadero guardado");
      await loadParkings(); renderParkings();
    }

    if (pending.kind === "landmark") {
      const { error } = await supabase.from("landmarks").insert({
        name: pending.name || null,
        type: landmarkTypeRef.current,
        location: { type: "Point", coordinates: coords },
      });
      if (error) return toast.error("No se pudo guardar el punto de referencia");
      toast.success("Punto de referencia guardado");
      await loadLandmarks(); renderLandmarks();
    }

    setPending(null);
    onModeReset?.(); // volver a idle tras crear
  };

  // ======= Context menu helpers =======
  const openCtx = (kind: CtxMenu["kind"], id: string, ll: L.LatLng, state?: any) => {
    if (!mapRef.current) return;
    const p = mapRef.current.latLngToContainerPoint(ll);
    if (kind === "footway") setCtx({ kind, id, latlng: ll, screen: { x: p.x, y: p.y }, state });
    if (kind === "building") setCtx({ kind, id, latlng: ll, screen: { x: p.x, y: p.y }, state });
    if (kind === "entrance") setCtx({ kind, id, latlng: ll, screen: { x: p.x, y: p.y } });
  };

  const toggleFootwayState = async (id: string) => {
    const fw = footways.find(f => f.id === id);
    if (!fw) return;
    const next: FootwayState = fw.state === "ABIERTO" ? "CERRADO" : "ABIERTO";
    await supabase.from("footways").update({ state: next }).eq("id", id);
    await loadFootways(); renderFootways(); renderVerticesLayer();
    toast.success(`Calle ${next.toLowerCase()}`);
    setCtx(null);
  };

  const deleteFootway = async (id: string) => {
    const { error } = await supabase.from("footways").delete().eq("id", id);
    if (error) return toast.error("No se pudo eliminar la calle");
    toast.success("Calle eliminada");
    await loadFootways(); renderFootways(); renderVerticesLayer();
    setCtx(null);
  };

  const toggleBuildingState = async (id: string) => {
    const b = buildings.find(x => x.id === id);
    if (!b) return;
    const next: BuildingState = b.state === "HABILITADO" ? "REPARACIÓN" : "HABILITADO";
    const { error } = await supabase.from("buildings").update({ state: next }).eq("id", id);
    if (error) return toast.error("No se pudo actualizar el estado");
    toast.success(`Edificio ${next.toLowerCase()}`);
    await loadBuildings(); addBuildingMarkers();
    setCtx(null);
  };

  const deleteBuilding = async (id: string) => {
    const { error } = await supabase.from("buildings").delete().eq("id", id);
    if (error) return toast.error("No se pudo eliminar (tiene dependencias)");
    toast.success("Edificio eliminado");
    await loadBuildings(); addBuildingMarkers();
    setCtx(null);
  };

  const startMoveEntrance = (id: string) => {
    const mk = entranceMarkersRef.current.get(id);
    if (!mk) return;
    const current = mk.getLatLng();
    setDragEditing({ id, original: current });
    mk.setLatLng(current);
    mk.dragging?.enable();
    setCtx(null);
  };

  const saveMoveEntrance = async () => {
    if (!dragEditing) return;
    const mk = entranceMarkersRef.current.get(dragEditing.id);
    if (!mk) return;
    const pos = mk.getLatLng();
    const { error } = await supabase.from("entrances").update({
      location: { type: "Point", coordinates: [pos.lng, pos.lat] as [number, number] }
    }).eq("id", dragEditing.id);
    if (error) return toast.error("No se pudo guardar la posición");
    toast.success("Entrada actualizada");
    mk.dragging?.disable();
    setDragEditing(null);
    await loadEntrances(); renderEntrances();
  };

  const cancelMoveEntrance = () => {
    if (!dragEditing) return;
    const mk = entranceMarkersRef.current.get(dragEditing.id);
    if (mk) {
      mk.setLatLng(dragEditing.original);
      mk.dragging?.disable();
    }
    setDragEditing(null);
  };

  const deleteEntrance = async (id: string) => {
    const { error } = await supabase.from("entrances").delete().eq("id", id);
    if (error) return toast.error("No se pudo eliminar la entrada");
    toast.success("Entrada eliminada");
    setCtx(null);
    await loadEntrances(); renderEntrances();
  };

  // ======= Render =======
  return (
    <div className="relative w-full h-full">
      <div ref={mapEl} className="absolute inset-0 rounded-lg shadow-lg z-0" />
      <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-transparent to-background/5 rounded-lg z-[1]" />

      {/* Banner modo (solo info, sin controles) */}
      {mode !== "idle" && !pending && (
        <div className="absolute top-3 right-3 z-[1200] pointer-events-none">
          <div className="px-3 py-1 rounded-full bg-amber-500 text-amber-950 text-sm font-semibold shadow">
            {mode === "footwayAB" && "Dibujar calle (A→B) • Click vértices o mapa"}
            {mode === "entrance" && "Nueva puerta • Click mapa"}
            {mode === "parking" && "Nuevo parqueadero • Click mapa"}
            {mode === "landmark" && "Nueva referencia • Click mapa"}
          </div>
        </div>
      )}

      {/* Panel flotante para crear POIs (sin prompts) */}
      {pending && (
        <div className="absolute top-4 left-4 z-[1300] w-[min(92vw,380px)] pointer-events-auto">
          <div className="bg-card/95 backdrop-blur rounded-xl border shadow-xl p-3 space-y-3">
            <div className="text-sm font-semibold">
              {pending.kind === "entrance" && "Nueva puerta"}
              {pending.kind === "parking" && "Nuevo parqueadero"}
              {pending.kind === "landmark" && "Nuevo punto de referencia"}
            </div>

            <div className="grid gap-2 text-sm">
              <label className="grid gap-1">
                <span className="text-xs text-muted-foreground">Nombre (opcional)</span>
                <input
                  className="px-2 py-1.5 rounded border bg-background"
                  value={pending.name}
                  onChange={(e) => setPending({ ...pending, name: e.target.value })}
                  placeholder="Ej: Puerta principal"
                />
              </label>

              <label className="grid gap-1">
                <span className="text-xs text-muted-foreground">Vincular a edificio</span>
                <select
                  className="px-2 py-1.5 rounded border bg-background"
                  value={pending.buildingId ?? ""}
                  onChange={(e) =>
                    setPending({ ...pending, buildingId: e.target.value || null })
                  }
                >
                  <option value="">— Sin enlace —</option>
                  {sortedBuildingsFor(pending.latlng).map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="flex justify-end gap-2">
              <button
                className="px-3 py-1.5 rounded border"
                onClick={() => { setPending(null); onModeReset?.(); }}
              >
                Cancelar
              </button>
              <button
                className="px-3 py-1.5 rounded bg-primary text-primary-foreground"
                onClick={submitPending}
              >
                Guardar
              </button>
            </div>

            <div className="text-[11px] text-muted-foreground">
              Lat: {pending.latlng.lat.toFixed(6)} · Lon: {pending.latlng.lng.toFixed(6)}
            </div>
          </div>
        </div>
      )}

      {/* Context menu (acciones sobre un elemento) */}
      {ctx && (
        <div
          className="absolute z-[1400] pointer-events-auto"
          style={{ left: ctx.screen.x + 8, top: ctx.screen.y + 8 }}
        >
          <div className="bg-card/95 backdrop-blur rounded-md border shadow-xl p-2 text-sm space-y-1 min-w-[200px]">
            {ctx.kind === "footway" && (
              <>
                <div className="px-1 py-0.5 text-xs text-muted-foreground">Calle</div>
                <button
                  className="w-full text-left px-2 py-1 rounded hover:bg-accent"
                  onClick={() => toggleFootwayState(ctx.id)}
                >
                  {ctx.state === "ABIERTO" ? "Cerrar" : "Abrir"}
                </button>
                <button
                  className="w-full text-left px-2 py-1 rounded hover:bg-accent text-red-600"
                  onClick={() => deleteFootway(ctx.id)}
                >
                  Eliminar
                </button>
              </>
            )}

            {ctx.kind === "building" && (
              <>
                <div className="px-1 py-0.5 text-xs text-muted-foreground">Edificio</div>
                <button
                  className="w-full text-left px-2 py-1 rounded hover:bg-accent"
                  onClick={() => toggleBuildingState(ctx.id)}
                >
                  Cambiar a {ctx.state === "HABILITADO" ? "REPARACIÓN" : "HABILITADO"}
                </button>
                <button
                  className="w-full text-left px-2 py-1 rounded hover:bg-accent text-red-600"
                  onClick={() => deleteBuilding(ctx.id)}
                >
                  Eliminar
                </button>
              </>
            )}

            {ctx.kind === "entrance" && (
              <>
                <div className="px-1 py-0.5 text-xs text-muted-foreground">Entrada</div>
                {!dragEditing ? (
                  <button
                    className="w-full text-left px-2 py-1 rounded hover:bg-accent"
                    onClick={() => startMoveEntrance(ctx.id)}
                  >
                    Mover
                  </button>
                ) : dragEditing.id === ctx.id ? (
                  <>
                    <button
                      className="w-full text-left px-2 py-1 rounded hover:bg-accent"
                      onClick={saveMoveEntrance}
                    >
                      Guardar posición
                    </button>
                    <button
                      className="w-full text-left px-2 py-1 rounded hover:bg-accent"
                      onClick={cancelMoveEntrance}
                    >
                      Cancelar movimiento
                    </button>
                  </>
                ) : (
                  <div className="px-2 py-1 text-xs text-muted-foreground">
                    Editando otra entrada…
                  </div>
                )}
                <button
                  className="w-full text-left px-2 py-1 rounded hover:bg-accent text-red-600"
                  onClick={() => deleteEntrance(ctx.id)}
                >
                  Eliminar
                </button>
              </>
            )}

            <div className="pt-1 border-t mt-1">
              <button
                className="w-full text-left px-2 py-1 rounded hover:bg-accent"
                onClick={() => setCtx(null)}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MapComponent;
