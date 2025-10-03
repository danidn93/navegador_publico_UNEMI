import React, { useState, useMemo, useEffect } from 'react';
import { Search, MapPin, Building2, GraduationCap, Beaker, BookOpen, Coffee, Users } from 'lucide-react';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";

interface Room {
  id: string;
  name: string;
  room_number?: string;
  description?: string;
  capacity?: number;
  keywords?: string[];
  equipment?: string[];
  floor: {
    floor_number: number;
    floor_name?: string;
    building: {
      name: string;
      building_code?: string;
      latitude: number;
      longitude: number;
    };
  };
  room_type: {
    name: string;
    description?: string;
  };
}

const roomTypeCategories = [
  { id: 'all', name: 'Todos', icon: Building2 },
  { id: 'Aula', name: 'Aulas', icon: BookOpen },
  { id: 'Oficina', name: 'Oficinas', icon: Building2 },
  { id: 'Laboratorio', name: 'Laboratorios', icon: Beaker },
  { id: 'Facultad', name: 'Facultades', icon: GraduationCap },
  { id: 'Departamento', name: 'Departamentos', icon: Users }
];

interface SearchPanelProps {
  onLocationSelect: (location: any) => void;
  selectedLocation?: any;
}

const SearchPanel: React.FC<SearchPanelProps> = ({ onLocationSelect, selectedLocation }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadRooms();
  }, []);

  const loadRooms = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('rooms')
        .select(`
          *,
          floor:floors(
            floor_number,
            floor_name,
            building:buildings(
              name,
              building_code,
              latitude,
              longitude
            )
          ),
          room_type:room_types(
            name,
            description
          )
        `)
        .order('name');
      
      if (error) throw error;
      setRooms(data || []);
    } catch (error) {
      console.error('Error loading rooms:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredRooms = useMemo(() => {
    let filtered = rooms;

    // Filter by category
    if (selectedCategory !== 'all') {
      filtered = filtered.filter(room => room.room_type?.name === selectedCategory);
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(room => 
        room.name.toLowerCase().includes(query) ||
        room.description?.toLowerCase().includes(query) ||
        room.room_number?.toLowerCase().includes(query) ||
        room.floor?.building?.name.toLowerCase().includes(query) ||
        room.keywords?.some(keyword => keyword.toLowerCase().includes(query)) ||
        room.equipment?.some(equipment => equipment.toLowerCase().includes(query))
      );
    }

    return filtered;
  }, [rooms, searchQuery, selectedCategory]);

  return (
    <Card className="w-full h-full flex flex-col bg-card/95 backdrop-blur-sm">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2">
          <div className="w-8 h-8 bg-gradient-to-br from-primary to-accent rounded-full flex items-center justify-center">
            <MapPin className="h-4 w-4 text-primary-foreground" />
          </div>
          UNEMI Navigator
        </CardTitle>
        <p className="text-sm text-muted-foreground">Encuentra ubicaciones en el campus</p>
      </CardHeader>
      
      <CardContent className="flex-1 flex flex-col space-y-4">
        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar aulas, oficinas, laboratorios..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Categorías</p>
            <div className="flex flex-wrap gap-2 mb-4">
              {roomTypeCategories.map(category => {
                const IconComponent = category.icon;
                return (
                  <Badge 
                    key={category.id}
                    variant={selectedCategory === category.id ? "default" : "secondary"}
                    className="cursor-pointer hover:bg-accent transition-colors"
                    onClick={() => setSelectedCategory(category.id)}
                  >
                    <IconComponent className="h-3 w-3 mr-1" />
                    {category.name}
                  </Badge>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex-1 flex flex-col">
          <p className="text-sm font-medium mb-2">
            Ubicaciones ({filteredRooms.length})
          </p>
          
          <ScrollArea className="flex-1 pr-2">
            <div className="space-y-2">
              {loading ? (
                <div className="text-center py-8 text-muted-foreground">
                  <p>Cargando ubicaciones...</p>
                </div>
              ) : filteredRooms.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Search className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No se encontraron ubicaciones</p>
                </div>
              ) : (
                filteredRooms.map(room => (
                  <div
                    key={room.id}
                    className={`p-3 rounded-lg border cursor-pointer transition-all hover:shadow-md ${
                      selectedLocation?.id === room.id
                        ? 'border-accent bg-accent/5 shadow-sm'
                        : 'border-border hover:border-accent/50'
                    }`}
                    onClick={() => onLocationSelect({
                      ...room,
                      coordinates: [room.floor.building.longitude, room.floor.building.latitude],
                      building_name: room.floor.building.name,
                      floor_info: `Piso ${room.floor.floor_number}${room.floor.floor_name ? ` - ${room.floor.floor_name}` : ''}`
                    })}
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 bg-accent/10 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                        <MapPin className="h-4 w-4 text-accent" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-sm mb-1 leading-tight">
                          {room.name}
                          {room.room_number && (
                            <span className="ml-2 text-xs text-muted-foreground">({room.room_number})</span>
                          )}
                        </h3>
                        <p className="text-xs text-muted-foreground mb-1">
                          {room.floor.building.name} - Piso {room.floor.floor_number}
                        </p>
                        {room.description && (
                          <p className="text-xs text-muted-foreground mb-2 line-clamp-2">
                            {room.description}
                          </p>
                        )}
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="secondary" className="text-xs">
                            {room.room_type?.name || 'Tipo no definido'}
                          </Badge>
                          {room.capacity && (
                            <Badge variant="outline" className="text-xs">
                              {room.capacity} personas
                            </Badge>
                          )}
                        </div>
                        {room.keywords && room.keywords.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {room.keywords.slice(0, 3).map(keyword => (
                              <span key={keyword} className="text-xs bg-muted px-1 rounded">
                                {keyword}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </div>

        {selectedLocation && (
          <div className="border-t pt-4">
            <Button className="w-full">
              <MapPin className="h-4 w-4 mr-2" />
              Ir a {selectedLocation.name}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default SearchPanel;