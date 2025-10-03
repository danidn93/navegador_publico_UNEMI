-- Create room types table
CREATE TABLE public.room_types (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  icon TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create buildings table with GPS coordinates
CREATE TABLE public.buildings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  latitude DECIMAL(10, 8) NOT NULL,
  longitude DECIMAL(11, 8) NOT NULL,
  total_floors INTEGER NOT NULL DEFAULT 1,
  address TEXT,
  building_code TEXT UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create floors table
CREATE TABLE public.floors (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  building_id UUID NOT NULL REFERENCES public.buildings(id) ON DELETE CASCADE,
  floor_number INTEGER NOT NULL,
  floor_name TEXT,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(building_id, floor_number)
);

-- Create rooms table (aulas, oficinas, laboratorios, etc.)
CREATE TABLE public.rooms (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  floor_id UUID NOT NULL REFERENCES public.floors(id) ON DELETE CASCADE,
  room_type_id UUID NOT NULL REFERENCES public.room_types(id),
  name TEXT NOT NULL,
  room_number TEXT,
  description TEXT,
  capacity INTEGER,
  equipment TEXT[],
  keywords TEXT[], -- Para búsqueda (ej: "laboratorio de computación", "aula magna")
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.room_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.buildings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.floors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;

-- Create policies for public read access (campus navigation is public)
CREATE POLICY "Anyone can view room types" 
ON public.room_types FOR SELECT USING (true);

CREATE POLICY "Anyone can view buildings" 
ON public.buildings FOR SELECT USING (true);

CREATE POLICY "Anyone can view floors" 
ON public.floors FOR SELECT USING (true);

CREATE POLICY "Anyone can view rooms" 
ON public.rooms FOR SELECT USING (true);

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create triggers for automatic timestamp updates
CREATE TRIGGER update_room_types_updated_at
  BEFORE UPDATE ON public.room_types
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_buildings_updated_at
  BEFORE UPDATE ON public.buildings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_floors_updated_at
  BEFORE UPDATE ON public.floors
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_rooms_updated_at
  BEFORE UPDATE ON public.rooms
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default room types
INSERT INTO public.room_types (name, description, icon) VALUES
  ('Aula', 'Salón de clases tradicional', 'book-open'),
  ('Laboratorio', 'Laboratorio de investigación o prácticas', 'flask'),
  ('Oficina', 'Oficina administrativa o docente', 'briefcase'),
  ('Auditorio', 'Auditorio o sala de conferencias', 'users'),
  ('Biblioteca', 'Biblioteca o sala de lectura', 'library'),
  ('Cafetería', 'Cafetería o comedor', 'coffee'),
  ('Baño', 'Servicios sanitarios', 'door-open'),
  ('Decanato', 'Oficina de decanato', 'award'),
  ('Secretaría', 'Secretaría académica', 'file-text'),
  ('Coordinación', 'Coordinación de carrera', 'user-check');

-- Insert sample buildings for UNEMI
INSERT INTO public.buildings (name, description, latitude, longitude, total_floors, building_code) VALUES
  ('Edificio Central', 'Edificio principal de administración', -2.1394, -79.4645, 3, 'EC'),
  ('Facultad de Ingeniería', 'Edificio de la Facultad de Ciencias de la Ingeniería', -2.1396, -79.4642, 4, 'FI'),
  ('Facultad de Ciencias Administrativas', 'Edificio de Ciencias Administrativas y Comerciales', -2.1392, -79.4648, 3, 'FCA'),
  ('Facultad de Educación', 'Edificio de la Facultad de Ciencias de la Educación', -2.1398, -79.4640, 2, 'FE'),
  ('Biblioteca Central', 'Biblioteca principal del campus', -2.1390, -79.4646, 2, 'BC'),
  ('Centro de Cómputo', 'Centro de cómputo y tecnología', -2.1395, -79.4643, 1, 'CC');

-- Create indexes for better performance
CREATE INDEX idx_buildings_coordinates ON public.buildings(latitude, longitude);
CREATE INDEX idx_rooms_keywords ON public.rooms USING GIN(keywords);
CREATE INDEX idx_floors_building ON public.floors(building_id);
CREATE INDEX idx_rooms_floor ON public.rooms(floor_id);
CREATE INDEX idx_rooms_type ON public.rooms(room_type_id);