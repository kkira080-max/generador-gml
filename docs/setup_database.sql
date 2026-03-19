-- SQL para crear la tabla de estadísticas en Supabase
-- Ejecuta esto en el "SQL Editor" de tu proyecto de Supabase

CREATE TABLE IF NOT EXISTS public.global_stats (
    id BIGINT PRIMARY KEY DEFAULT 1,
    visits BIGINT DEFAULT 0,
    conversions BIGINT DEFAULT 0,
    downloads BIGINT DEFAULT 0,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Insertar la fila inicial si no existe
INSERT INTO public.global_stats (id, visits, conversions, downloads)
VALUES (1, 0, 0, 0)
ON CONFLICT (id) DO NOTHING;

-- Habilitar permisos públicos (lectura y actualización)
-- Nota: Para un proyecto real, se recomienda usar RLS más estricto, 
-- pero para este contador simple permitiremos el acceso público.
ALTER TABLE public.global_stats DISABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.global_stats TO anon;
GRANT ALL ON TABLE public.global_stats TO authenticated;
GRANT ALL ON TABLE public.global_stats TO service_role;

-- Función para incremento atómico
CREATE OR REPLACE FUNCTION increment_stat(row_id BIGINT, column_name TEXT)
RETURNS void AS $$
BEGIN
    EXECUTE format('UPDATE public.global_stats SET %I = %I + 1 WHERE id = %L', column_name, column_name, row_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
