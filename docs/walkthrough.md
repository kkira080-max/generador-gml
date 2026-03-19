# Walkthrough: Contador Online con Supabase

He completado la migración del sistema de estadísticas de `CounterAPI` (que fallaba por CORS) a **Supabase**. Esto hará que el contador sea mucho más fiable y profesional.

## Cambios realizados

1.  **Instalación de `@supabase/supabase-js`**: Añadida la biblioteca necesaria para conectar con la base de datos.
2.  **Cliente de Supabase**: Creado en `src/utils/supabaseClient.js` usando variables de entorno.
3.  **Lógica de App**: Actualizado `App.jsx` para que el incremento de visitas y descargas sea atómico mediante una función de base de datos (`rpc`).
4.  **Componente de Estadísticas**: Actualizado `Statistics.jsx` para leer directamente los datos globales de tu tabla en Supabase.
5.  **Botón de Soporte con Formspree**: El botón de soporte ahora abre un formulario emergente (modal) que pide Nombre, Email y Mensaje, enviándolos directamente a tu cuenta de Formspree.

## Pasos finales para activar el contador

Sigue estos 3 pasos para terminar la configuración:

### 1. Preparar la Base de Datos
Copia el contenido del archivo [setup_database.sql](file:///C:/Users/kirak/.gemini/antigravity/brain/c9507b12-b792-454e-9b87-b6722f20eccb/setup_database.sql) y pégalo en el **SQL Editor** de tu proyecto en Supabase. Dale a **Run**. Esto creará la tabla y la función de incremento.

### 2. Configurar Variables de Entorno
Crea un archivo llamado `.env` en la raíz de tu proyecto (si no existe ya) y añade estas dos líneas con tus datos de Supabase:

```env
VITE_SUPABASE_URL=tu_url_de_supabase_aqui
VITE_SUPABASE_ANON_KEY=tu_anon_key_de_supabase_aqui
VITE_FORMSPREE_ID=tu_id_de_formspree_aqui
```

### 3. Despliegue en Vercel
Cuando subas los cambios a Vercel, asegúrate de añadir esas mismas dos variables en el panel de **Environment Variables** de tu proyecto en Vercel para que el contador funcione en la web.

## Verificación

Para comprobar que funciona:
1.  Abre la pestaña **GLOBAL** en las estadísticas.
2.  Si ves ceros o números reales (después de configurar las claves), ¡la conexión es correcta!
3.  Prueba a refrescar la página; el contador de visitas debería subir en Supabase (y en la web al darle a Refrescar).
