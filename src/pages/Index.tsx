import { useMemo, useState } from 'react';
import { Menu, MapPin, DoorOpen, Building2, Pencil, ParkingSquare, MapPinned } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

import MapComponent, { MapClickCoords } from '@/components/MapComponent';
import SearchPanel from '@/components/SearchPanel';
import BuildingForm from '@/components/BuildingForm';
import RoomForm from '@/components/RoomForm';

type Building = {
  id: string;
  name: string;
  description?: string | null;
  latitude: number;
  longitude: number;
  total_floors: number;
  building_code?: string | null;
};

type SelectedLocation = MapClickCoords | Building | null;
function isCoords(x: SelectedLocation): x is MapClickCoords {
  return !!x && typeof (x as any).latitude === 'number' && typeof (x as any).longitude === 'number' && !(x as any).id;
}
function isBuilding(x: SelectedLocation): x is Building {
  return !!x && typeof (x as any).id === 'string';
}

type MapMode = "idle" | "footwayAB" | "entrance" | "parking" | "landmark";
type EntranceType = "pedestrian" | "vehicular" | "both";
type LandmarkType = "plazoleta" | "bar" | "corredor" | "otro";

const Index = () => {
  const [selectedLocation, setSelectedLocation] = useState<SelectedLocation>(null);
  const [showSidebar, setShowSidebar] = useState(true);

  const [showBuildingForm, setShowBuildingForm] = useState(false);
  const [showRoomForm, setShowRoomForm] = useState(false);

  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [clickedCoords, setClickedCoords] = useState<MapClickCoords | null>(null);

  const selectedBuildingId = useMemo(() => (isBuilding(selectedLocation) ? selectedLocation.id : null), [selectedLocation]);

  // controles del mapa
  const [mapMode, setMapMode] = useState<MapMode>("idle");
  const [entranceType, setEntranceType] = useState<EntranceType>("pedestrian");
  const [landmarkType] = useState<LandmarkType>("plazoleta"); // si quieres, agrega botones para cambiar tipo

  const handleLocationSelect = (location: any) => {
    setSelectedLocation(location);
    if (window.innerWidth < 768) setShowSidebar(false);
  };

  const handleBuildingAdded = () => setRefreshTrigger(prev => prev + 1);
  const handleRoomAdded = () => setRefreshTrigger(prev => prev + 1);

  return (
    <div className="relative h-screen w-full bg-background overflow-hidden">
      {/* Header */}
      <header className="absolute top-0 left-0 right-0 z-20 bg-primary text-primary-foreground shadow-lg">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-accent rounded-full flex items-center justify-center">
              <MapPin className="h-5 w-5 text-accent-foreground" />
            </div>
            <div>
              <h1 className="font-bold text-lg">UNEMI Campus Navigator</h1>
              <p className="text-xs opacity-80">Universidad Estatal de Milagro</p>
            </div>
          </div>

          {/* Acciones rápidas */}
          <div className="hidden md:flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => { setMapMode("footwayAB"); }} title="Dibujar calle peatonal (A→B)">
              <Pencil className="h-4 w-4 mr-2" /> Dibujar calle
            </Button>

            <Button variant="secondary" size="sm" onClick={() => { setEntranceType("pedestrian"); setMapMode("entrance"); }} title="Marcar puerta peatonal">
              <DoorOpen className="h-4 w-4 mr-2" /> Puerta peatonal
            </Button>
            <Button variant="secondary" size="sm" onClick={() => { setEntranceType("vehicular"); setMapMode("entrance"); }} title="Marcar puerta vehicular">
              <DoorOpen className="h-4 w-4 mr-2" /> Puerta vehicular
            </Button>
            <Button variant="secondary" size="sm" onClick={() => { setEntranceType("both"); setMapMode("entrance"); }} title="Marcar puerta (ambas)">
              <DoorOpen className="h-4 w-4 mr-2" /> Puerta (ambas)
            </Button>

            <Button variant="secondary" size="sm" onClick={() => { setMapMode("parking"); }} title="Marcar parqueadero">
              <ParkingSquare className="h-4 w-4 mr-2" /> Parqueadero
            </Button>

            <Button variant="secondary" size="sm" onClick={() => { setMapMode("landmark"); }} title="Crear punto de referencia">
              <MapPinned className="h-4 w-4 mr-2" /> Referencia
            </Button>

            <Button variant="secondary" size="sm" disabled={!selectedBuildingId} onClick={() => setShowRoomForm(true)}>
              <Building2 className="h-4 w-4 mr-2" /> Agregar Habitación
            </Button>
          </div>
        </div>
      </header>

      {/* Main */}
      <div className="flex h-full pt-16">
        {/* Sidebar */}
        <aside className={`absolute md:relative z-10 transition-transform duration-300 ${showSidebar ? 'translate-x-0' : '-translate-x-full md:translate-x-0'} ${showSidebar ? 'w-full md:w-96' : 'w-0 md:w-96'} h-full`}>
          <div className="h-full p-4 bg-background/95 backdrop-blur-sm border-r border-border/50 overflow-hidden">
            <SearchPanel onLocationSelect={handleLocationSelect} selectedLocation={selectedLocation} />
          </div>
        </aside>

        {/* Map */}
        <main className="flex-1 relative overflow-hidden">
          <div className="absolute inset-0">
            <MapComponent
              key={refreshTrigger}
              onLocationSelect={handleLocationSelect}
              onAddBuilding={(coords) => { setClickedCoords(coords); setShowBuildingForm(true); }}
              isAdmin={true}
              externalMode={mapMode}
              entranceType={entranceType}
              landmarkType={landmarkType}
              onModeReset={() => setMapMode("idle")}
            />
          </div>

          {/* Overlay cerrar panel en móvil */}
          {showSidebar && (
            <div className="absolute inset-0 bg-black/20 md:hidden z-[5]" onClick={() => setShowSidebar(false)} />
          )}

          {/* Botones móviles (opcionales) */}
        </main>
      </div>

      {/* Footer */}
      <footer className="absolute bottom-0 left-0 right-0 z-20 bg-primary text-primary-foreground">
        <div className="px-4 py-2 text-center">
          <p className="text-xs opacity-80">© 2025 Universidad Estatal de Milagro - Sistema de Navegación Campus</p>
        </div>
      </footer>

      {/* Tarjeta selección (mobile) */}
      {selectedLocation && !showSidebar && (
        <Card className="absolute bottom-16 left-4 right-4 z-20 md:hidden bg-card/95 backdrop-blur-sm">
          <div className="p-4">
            <div className="flex items-center justify-between">
              <div>
                {isBuilding(selectedLocation) ? (
                  <>
                    <h3 className="font-semibold text-foreground">{selectedLocation.name}</h3>
                    <p className="text-sm text-muted-foreground">
                      {selectedLocation.building_code ? `Código: ${selectedLocation.building_code} • ` : ''}
                      {selectedLocation.total_floors} {selectedLocation.total_floors === 1 ? 'piso' : 'pisos'}
                    </p>
                  </>
                ) : isCoords(selectedLocation) ? (
                  <>
                    <h3 className="font-semibold text-foreground">Ubicación seleccionada</h3>
                    <p className="text-sm text-muted-foreground">
                      Lat: {selectedLocation.latitude.toFixed(6)} · Lon: {selectedLocation.longitude.toFixed(6)}
                    </p>
                  </>
                ) : null}
              </div>
              <Button variant="outline" size="sm" onClick={() => setShowSidebar(true)}>
                <Menu className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Modal: Agregar Edificio */}
      {showBuildingForm && (
        <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
          <BuildingForm onClose={() => setShowBuildingForm(false)} onBuildingAdded={handleBuildingAdded} initialCoords={clickedCoords} />
        </div>
      )}

      {/* Modal: Agregar Habitación */}
      {showRoomForm && (
        <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
          <RoomForm onClose={() => setShowRoomForm(false)} onRoomAdded={handleRoomAdded} initialBuildingId={selectedBuildingId} initialFloorNumber={undefined} />
        </div>
      )}
    </div>
  );
};

export default Index;
