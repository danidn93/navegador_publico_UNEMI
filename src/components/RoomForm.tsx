import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import { X } from "lucide-react";

export interface RoomFormProps {
  onClose: () => void;
  onRoomAdded: () => void;
  initialBuildingId?: string | null;
  initialFloorNumber?: number | null;
}

type Building = {
  id: string;
  name: string;
  building_code: string | null;
  total_floors: number;
};

type Floor = {
  id: string;
  building_id: string;
  floor_number: number;
  floor_name: string | null;
};

type RoomType = {
  id: string;
  name: string;
};

export default function RoomForm({
  onClose,
  onRoomAdded,
  initialBuildingId = null,
  initialFloorNumber = null,
}: RoomFormProps) {
  const [saving, setSaving] = useState(false);

  const [buildings, setBuildings] = useState<Building[]>([]);
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  const [floors, setFloors] = useState<Floor[]>([]);

  const [buildingId, setBuildingId] = useState<string | "">(
    initialBuildingId ?? ""
  );
  const [floorId, setFloorId] = useState<string | "">("");
  const [roomTypeId, setRoomTypeId] = useState<string | "">("");

  const [name, setName] = useState("");
  const [roomNumber, setRoomNumber] = useState("");
  const [capacity, setCapacity] = useState<number | "">("");
  const [description, setDescription] = useState("");
  const [directions, setDirections] = useState("");
  const [equipment, setEquipment] = useState("");
  const [keywords, setKeywords] = useState("");

  const [newFloorNumber, setNewFloorNumber] = useState<number | "">(
    initialFloorNumber ?? ""
  );
  const [newFloorName, setNewFloorName] = useState("");
  const [tmpTypeName, setTmpTypeName] = useState("");

  const selectedBuilding = useMemo(
    () => buildings.find(b => b.id === buildingId) || null,
    [buildings, buildingId]
  );

  // ========= Load buildings & room types =========
  useEffect(() => {
    const load = async () => {
      try {
        const [bRes, tRes] = await Promise.all([
          supabase
            .from("buildings")
            .select("id,name,building_code,total_floors")
            .order("name", { ascending: true }),
          supabase
            .from("room_types")
            .select("id,name")
            .order("name", { ascending: true }),
        ]);
        if (bRes.error) throw bRes.error;
        if (tRes.error) throw tRes.error;

        const b = bRes.data || [];
        setBuildings(b);
        setRoomTypes(tRes.data || []);

        if (initialBuildingId) {
          setBuildingId(initialBuildingId);
          console.log("[RoomForm] initialBuildingId=", initialBuildingId);
          fetchFloors(initialBuildingId); // carga inmediata
        } else if (!buildingId && b.length > 0) {
          setBuildingId(b[0].id);
          console.log("[RoomForm] defaultBuildingId=", b[0].id);
          fetchFloors(b[0].id); // carga inmediata
        }
      } catch (err: any) {
        console.error("[RoomForm] Error cargando edificios/tipos:", err);
        toast.error("Error cargando edificios o tipos");
      }
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ========= Load floors by building =========
  const fetchFloors = async (bId: string) => {
    try {
      if (!bId) return;
      console.log("[RoomForm] fetchFloors buildingId=", bId);
      const { data, error } = await supabase
        .from("floors")
        .select("id, building_id, floor_number, floor_name")
        .eq("building_id", bId)
        .order("floor_number", { ascending: true });

      if (error) throw error;

      console.log("[RoomForm] floors fetched:", data?.length ?? 0);
      setFloors(data || []);

      if (!data || data.length === 0) {
        console.log("[RoomForm] No hay pisos (¿RLS/policies?) para building_id:", bId);
      }

      if (initialFloorNumber != null && data && data.length) {
        const found = data.find(f => f.floor_number === initialFloorNumber);
        if (found) setFloorId(found.id);
      }
    } catch (err: any) {
      console.error("[RoomForm] Error cargando pisos:", err);
      toast.error("Error cargando pisos");
    }
  };

  useEffect(() => {
    if (!buildingId) {
      setFloors([]);
      setFloorId("");
      return;
    }
    fetchFloors(buildingId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildingId]);

  // ========= Create floors 1..N =========
  const handleCreateFloorsFromBuilding = async () => {
    if (!selectedBuilding) {
      toast.error("Selecciona un edificio");
      return;
    }
    const n = selectedBuilding.total_floors;
    if (!n || n < 1) {
      toast.error("El edificio no tiene total_floors válido");
      return;
    }

    try {
      setSaving(true);
      const { data: existing, error: exErr } = await supabase
        .from("floors")
        .select("floor_number")
        .eq("building_id", selectedBuilding.id);
      if (exErr) throw exErr;

      const existingSet = new Set((existing || []).map(f => f.floor_number));
      const toInsert = [];
      for (let i = 1; i <= n; i++) {
        if (!existingSet.has(i)) {
          toInsert.push({
            building_id: selectedBuilding.id,
            floor_number: i,
            floor_name: `Piso ${i}`,
          });
        }
      }

      if (toInsert.length === 0) {
        toast.info("Ya existen todos los pisos 1..N");
      } else {
        const { error } = await supabase.from("floors").insert(toInsert);
        if (error) throw error;
        toast.success(`Se crearon ${toInsert.length} piso(s)`);
      }

      await fetchFloors(selectedBuilding.id);
    } catch (err: any) {
      console.error("[RoomForm] Error creando pisos 1..N:", err);
      toast.error(err.message || "Error creando pisos");
    } finally {
      setSaving(false);
    }
  };

  // ========= Create single floor =========
  const handleCreateFloor = async () => {
    if (!buildingId) {
      toast.error("Selecciona un edificio antes de crear un piso");
      return;
    }
    const n =
      typeof newFloorNumber === "string"
        ? parseInt(newFloorNumber || "0", 10)
        : newFloorNumber;

    if (!n || isNaN(n)) {
      toast.error("Número de piso inválido");
      return;
    }

    const floor_name = newFloorName?.trim() || `Piso ${n}`;

    try {
      setSaving(true);
      const { data, error } = await supabase
        .from("floors")
        .insert({
          building_id: buildingId,
          floor_number: n,
          floor_name,
        })
        .select("id, building_id, floor_number, floor_name")
        .single();

      if (error) throw error;

      toast.success("Piso creado");
      setFloors(prev => [...prev, data].sort((a, b) => a.floor_number - b.floor_number));
      setFloorId(data.id);
    } catch (err: any) {
      console.error("[RoomForm] Error creando piso:", err);
      if (String(err.message || "").toLowerCase().includes("duplicate")) {
        toast.error("Ese número de piso ya existe en este edificio");
      } else {
        toast.error(err.message || "Error creando piso");
      }
    } finally {
      setSaving(false);
    }
  };

  // ========= Create room type quick =========
  const handleSaveRoomType = async () => {
    const name = tmpTypeName.trim();
    if (!name) return;
    try {
      setSaving(true);
      const { data, error } = await supabase
        .from("room_types")
        .insert({ name })
        .select("id,name")
        .single();
      if (error) throw error;
      setRoomTypes(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
      setRoomTypeId(data.id);
      setTmpTypeName("");
      toast.success("Tipo creado");
    } catch (err: any) {
      console.error("[RoomForm] Error creando tipo:", err);
      if (String(err.message || "").toLowerCase().includes("duplicate")) {
        toast.error("Ese tipo ya existe");
      } else {
        toast.error(err.message || "Error creando tipo");
      }
    } finally {
      setSaving(false);
    }
  };

  // ========= Save room =========
  const equipmentArray = equipment
    ? equipment.split(",").map(s => s.trim()).filter(Boolean)
    : [];
  const keywordsArray = keywords
    ? keywords.split(",").map(s => s.trim()).filter(Boolean)
    : [];

  const handleSaveRoom = async () => {
    if (!buildingId) return toast.error("Selecciona un edificio");
    if (!floorId) return toast.error("Selecciona un piso");
    if (!roomTypeId) return toast.error("Selecciona un tipo");
    if (!name.trim()) return toast.error("Ingresa el nombre de la habitación");

    try {
      setSaving(true);
      const { error } = await supabase.from("rooms").insert({
        floor_id: floorId,
        room_type_id: roomTypeId,
        name: name.trim(),
        room_number: roomNumber || null,
        description: description || null,
        capacity: capacity === "" ? null : Number(capacity),
        equipment: equipmentArray.length ? equipmentArray : null,
        keywords: keywordsArray.length ? keywordsArray : null,
        directions: directions || null,
      });
      if (error) throw error;

      toast.success("Habitación creada");
      onRoomAdded();
      onClose();
    } catch (err: any) {
      console.error("[RoomForm] Error creando habitación:", err);
      toast.error(err.message || "Error creando habitación");
    } finally {
      setSaving(false);
    }
  };

  // ===== UI (modal centrado + scroll) =====
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* overlay */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* card */}
      <div className="relative bg-card text-card-foreground w-full max-w-2xl rounded-2xl shadow-2xl border border-border max-h-[85vh] overflow-hidden">
        {/* header */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3 border-b bg-card/95 backdrop-blur">
          <h2 className="text-lg font-semibold">Agregar Habitación</h2>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* contenido */}
        <div className="p-4 md:p-6 overflow-y-auto max-h-[calc(85vh-56px-64px)]">
          {/* Edificio */}
          <div className="grid gap-1.5 mb-3">
            <Label>Edificio</Label>
            <Select
              value={buildingId}
              onValueChange={(v) => {
                setBuildingId(v);
                setFloorId("");
                fetchFloors(v); // 👈 carga inmediata
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecciona un edificio" />
              </SelectTrigger>
              {/* 👇 IMPORTANTE: z alto para quedar sobre el overlay */}
              <SelectContent position="popper" className="z-[200]">
                {buildings.map(b => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Pisos + acciones */}
          <div className="grid md:grid-cols-2 gap-4 mb-4">
            <div className="grid gap-1.5">
              <Label>Piso</Label>
              <Select
                value={floorId}
                onValueChange={(v) => setFloorId(v)}
                disabled={!buildingId}
              >
                <SelectTrigger>
                  <SelectValue placeholder={buildingId ? "Selecciona un piso" : "Selecciona un edificio primero"} />
                </SelectTrigger>
                {/* 👇 z alto para no quedar por debajo del overlay */}
                <SelectContent position="popper" className="z-[200]">
                  {floors.map(f => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.floor_name || `Piso ${f.floor_number}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {buildingId && floors.length === 0 && (
                <div className="text-xs text-muted-foreground mt-2 space-y-2">
                  <p>No se encontraron pisos para este edificio.</p>
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => fetchFloors(buildingId)}
                    >
                      Recargar pisos
                    </Button>
                    {selectedBuilding && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={handleCreateFloorsFromBuilding}
                      >
                        Crear pisos 1..{selectedBuilding.total_floors || "N"}
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="grid gap-1.5">
              <Label>Acciones de pisos</Label>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="secondary"
                  onClick={handleCreateFloorsFromBuilding}
                  disabled={!selectedBuilding || saving}
                >
                  Crear pisos 1..N
                </Button>

                <Input
                  className="w-20"
                  type="number"
                  placeholder="N°"
                  value={newFloorNumber}
                  onChange={(e) =>
                    setNewFloorNumber(
                      e.target.value === "" ? "" : parseInt(e.target.value, 10)
                    )
                  }
                  disabled={!buildingId || saving}
                  min={-10}
                  max={200}
                />
                <Input
                  className="w-40"
                  placeholder="Nombre (opcional)"
                  value={newFloorName}
                  onChange={(e) => setNewFloorName(e.target.value)}
                  disabled={!buildingId || saving}
                />
                <Button onClick={handleCreateFloor} disabled={!buildingId || saving}>
                  Crear piso
                </Button>
              </div>
            </div>
          </div>

          {/* Tipo */}
          <div className="grid md:grid-cols-2 gap-4 mb-4">
            <div className="grid gap-1.5">
              <Label>Tipo</Label>
              <Select value={roomTypeId} onValueChange={setRoomTypeId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona un tipo" />
                </SelectTrigger>
                {/* 👇 también con z alto */}
                <SelectContent position="popper" className="z-[200]">
                  {roomTypes.map(rt => (
                    <SelectItem key={rt.id} value={rt.id}>{rt.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1.5">
              <Label>Crear tipo (rápido)</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="Ej: Laboratorio, Aula, Oficina..."
                  value={tmpTypeName}
                  onChange={(e) => setTmpTypeName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleSaveRoomType(); }}
                />
                <Button onClick={handleSaveRoomType} disabled={saving}>Añadir</Button>
              </div>
            </div>
          </div>

          {/* Datos de la habitación */}
          <div className="grid md:grid-cols-2 gap-4">
            <div className="grid gap-1.5">
              <Label>Nombre</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Laboratorio de Química" />
            </div>
            <div className="grid gap-1.5">
              <Label>Número / Código (opcional)</Label>
              <Input value={roomNumber} onChange={(e) => setRoomNumber(e.target.value)} placeholder="Ej: R-201" />
            </div>
            <div className="grid gap-1.5">
              <Label>Capacidad (opcional)</Label>
              <Input
                type="number"
                min={0}
                value={capacity}
                onChange={(e) => setCapacity(e.target.value === "" ? "" : parseInt(e.target.value, 10))}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Equipo (coma-separado, opcional)</Label>
              <Input
                value={equipment}
                onChange={(e) => setEquipment(e.target.value)}
                placeholder="proyector, pizarra, tomas, Bunsen"
              />
            </div>
          </div>

          <div className="grid gap-1.5 mt-4">
            <Label>Keywords (coma-separado, opcional)</Label>
            <Input
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              placeholder="química, laboratorio, seguridad"
            />
          </div>

          <div className="grid gap-1.5 mt-4">
            <Label>Descripción (opcional)</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descripción breve del espacio y su uso."
            />
          </div>

          <div className="grid gap-1.5 mt-4">
            <Label>Indicaciones de cómo llegar (opcional)</Label>
            <Textarea
              value={directions}
              onChange={(e) => setDirections(e.target.value)}
              placeholder="Ej: Ingreso por puerta principal del bloque R, subir al 2° piso, al fondo a la derecha."
            />
          </div>
        </div>

        {/* footer */}
        <div className="sticky bottom-0 z-10 flex items-center justify-end gap-2 px-4 py-3 border-t bg-card/95 backdrop-blur">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSaveRoom} disabled={saving}>
            {saving ? "Guardando..." : "Guardar"}
          </Button>
        </div>
      </div>
    </div>
  );
}
