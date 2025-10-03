// src/components/BuildingForm.tsx
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type LatLng = { latitude: number; longitude: number };

export interface BuildingFormProps {
  onClose: () => void;
  onBuildingAdded: () => void;
  initialCoords?: LatLng | null; // coords que te pasa el MapComponent al hacer clic
}

// Enum esperado en BD: 'HABILITADO' | 'REPARACIÓN'
type BuildingState = "HABILITADO" | "REPARACIÓN";

export default function BuildingForm({
  onClose,
  onBuildingAdded,
  initialCoords,
}: BuildingFormProps) {
  const [name, setName] = useState("");
  const [buildingCode, setBuildingCode] = useState("");
  const [description, setDescription] = useState("");
  const [totalFloors, setTotalFloors] = useState<number>(1);
  const [lat, setLat] = useState<number>(initialCoords?.latitude ?? 0);
  const [lng, setLng] = useState<number>(initialCoords?.longitude ?? 0);
  const [state, setState] = useState<BuildingState>("HABILITADO");
  const [saving, setSaving] = useState(false);

  // Si cambian coords iniciales (abriste form desde otro clic)
  useEffect(() => {
    if (initialCoords) {
      setLat(initialCoords.latitude);
      setLng(initialCoords.longitude);
    }
  }, [initialCoords]);

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Ingresa el nombre del edificio");
      return;
    }
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      toast.error("Faltan coordenadas válidas (haz clic en el mapa para prellenarlas)");
      return;
    }
    if (totalFloors < 1) {
      toast.error("El número de pisos debe ser al menos 1");
      return;
    }

    try {
      setSaving(true);
      const { error } = await supabase.from("buildings").insert({
        name,
        building_code: buildingCode || null,
        description: description || null,
        total_floors: totalFloors,
        latitude: lat,
        longitude: lng,
        state, // <<<<<<<< nuevo campo enum
      });

      if (error) throw error;
      toast.success("Edificio creado");
      onBuildingAdded();
      onClose();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Error al guardar el edificio");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-card text-card-foreground rounded-xl shadow-xl w-full max-w-lg p-4 md:p-6">
      <h2 className="text-lg font-semibold mb-4">Agregar Edificio</h2>

      <div className="grid gap-3">
        <div className="grid gap-1.5">
          <Label>Nombre</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Bloque A" />
        </div>

        <div className="grid gap-1.5">
          <Label>Código (opcional)</Label>
          <Input value={buildingCode} onChange={(e) => setBuildingCode(e.target.value)} placeholder="Ej: A-01" />
        </div>

        <div className="grid gap-1.5">
          <Label>Descripción (opcional)</Label>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Información breve" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label>Pisos</Label>
            <Input
              type="number"
              min={1}
              value={totalFloors}
              onChange={(e) => setTotalFloors(parseInt(e.target.value || "1", 10))}
            />
          </div>

          <div className="grid gap-1.5">
            <Label>Estado</Label>
            <select
              className="h-9 px-3 rounded-md border bg-background"
              value={state}
              onChange={(e) => setState(e.target.value as BuildingState)}
            >
              <option value="HABILITADO">HABILITADO</option>
              <option value="REPARACIÓN">REPARACIÓN</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label>Latitud</Label>
            <Input
              type="number"
              step="0.0000001"
              value={lat}
              onChange={(e) => setLat(parseFloat(e.target.value))}
            />
          </div>
          <div className="grid gap-1.5">
            <Label>Longitud</Label>
            <Input
              type="number"
              step="0.0000001"
              value={lng}
              onChange={(e) => setLng(parseFloat(e.target.value))}
            />
          </div>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-end gap-2">
        <Button variant="outline" onClick={onClose} disabled={saving}>
          Cancelar
        </Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Guardando..." : "Guardar"}
        </Button>
      </div>
    </div>
  );
}
