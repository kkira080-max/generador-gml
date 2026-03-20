import React from 'react';
import { X, Shield, Scale } from 'lucide-react';

export default function LegalModal({ isOpen, onClose, type }) {
  if (!isOpen) return null;

  const content = {
    legal: {
      title: 'AVISO LEGAL',
      icon: <Scale size={20} color="var(--accent-primary)" />,
      paragraphs: [
        'CONDICIONES DE USO DEL “GENERADOR GML”',
        '1. Objeto: Las presentes Condiciones de Uso regulan el acceso, navegación y utilización de la herramienta denominada “Generador GML”, destinada a la generación de ficheros en formato GML conforme a las Directrices Técnicas de la Dirección General del Catastro de España.',
        '2. Naturaleza de la herramienta: La Herramienta tiene carácter técnico, auxiliar y meramente orientativo. No constituye un servicio oficial ni sustituye el trabajo, criterio ni responsabilidad del técnico competente.',
        '3. Ausencia de vinculación con la Administración: La Herramienta ha sido desarrollada de forma independiente y no mantiene ninguna relación ni respaldo institucional con la Dirección General del Catastro ni con ningún otro organismo de la Administración Pública.',
        '4. Condiciones de acceso y uso: El acceso es gratuito. El Usuario se compromete a utilizar la Herramienta de conformidad con la legislación vigente e introducir datos veraces.',
        '5. Responsabilidad del usuario: El Usuario asume la responsabilidad exclusiva del uso que realice de la Herramienta, incluyendo la exactitud de los datos y la adecuación del fichero a la realidad física y jurídica del inmueble.',
        '6. Exclusión de garantías: La Herramienta se proporciona “tal cual”, sin garantías de ningún tipo sobre la exactitud, fiabilidad o integridad de los resultados.',
        '7. Limitación de responsabilidad: Los desarrolladores no serán responsables de daños directos o indirectos, pérdidas económicas o rechazos en procedimientos administrativos derivados del uso de la Herramienta.',
        '8. Validación de resultados: Los ficheros generados deben ser validados previamente a su uso en procedimientos oficiales, recomendándose encarecidamente la validación en la Sede Electrónica del Catastro.',
        '9. Propiedad intelectual: Todos los derechos sobre la Herramienta corresponden a sus desarrolladores. Queda prohibida su reproducción o modificación sin autorización.',
        '10. Disponibilidad del servicio: No se garantiza la disponibilidad continua. Podrán realizarse modificaciones o suspensiones del servicio sin previo aviso.',
        '11. Protección de datos: El Usuario es responsable de cumplir con la normativa de protección de datos al introducir información en la Herramienta.',
        '12. Modificaciones: Los desarrolladores se reservan el derecho a modificar estas condiciones en cualquier momento.',
        '13. Legislación y jurisdicción: Las presentes condiciones se rigen por la legislación española, sometiéndose a los Juzgados y Tribunales correspondientes.',
        '14. Aceptación: El uso de la Herramienta implica la aceptación íntegra de estas condiciones.'
      ]
    },
    privacy: {
      title: 'POLÍTICA DE PRIVACIDAD',
      icon: <Shield size={20} color="var(--accent-primary)" />,
      paragraphs: [
        'POLÍTICA DE PRIVACIDAD',
        '1. Compromiso con la privacidad: Los desarrolladores garantizan un tratamiento de datos acorde con el RGPD y la normativa española aplicable.',
        '2. Naturaleza del tratamiento: La Herramienta no requiere registro, no solicita datos identificativos y no almacena información técnica introducida por el Usuario.',
        '3. Procesamiento local: Toda la información (geometrías, coordenadas, archivos) es procesada exclusivamente en el navegador del Usuario, sin envío a servidores externos.',
        '4. Ausencia de almacenamiento y transmisión: No se almacenan ficheros ni se transmite información técnica a terceros. Todo permanece en el entorno local del Usuario.',
        '5. Datos estadísticos anónimos: Se podrán recoger métricas de uso agregadas (conversiones, descargas) mediante servicios como Supabase, sin identificar al Usuario.',
        '6. Base jurídica: El tratamiento de datos estadísticos anónimos se basa en el interés legítimo de mejorar el funcionamiento y utilidad de la Herramienta Utilizamos herramientas como Supabase únicamente para recopilar estadísticas de uso anónimas (número de conversiones y descargas) con el fin de mejorar la herramienta y cuantificar su impact.',
        '7. Cookies: Se podrán utilizar cookies técnicas o analíticas con fines estadísticos, siempre de carácter agregado y anónimo.',
        '8. Responsabilidad del usuario: El Usuario se compromete a no introducir datos de terceros sin base legal y a utilizar la Herramienta conforme a la normativa vigente.',
        '9. Seguridad: El procesamiento es local, por lo que la seguridad depende del entorno del Usuario, aunque la Herramienta sigue buenas prácticas de desarrollo.',
        '10. Derechos del usuario: Al no recabarse datos identificables, el ejercicio de derechos del RGPD no resulta de aplicación en principio.',
        '11. Servicios de terceros: El uso de Supabase se limita a funciones técnicas y estadísticas bajo garantías adecuadas de protección de datos.',
        '12. Modificaciones: Los desarrolladores se reservan el derecho a modificar esta política para adaptarla a cambios normativos o mejoras.',
        '13. Aceptación: El uso de la Herramienta implica la aceptación íntegra de esta Política de Privacidad.'
      ]
    },
    cookies: {
      title: 'POLÍTICA DE COOKIES',
      icon: <Shield size={20} color="var(--accent-primary)" />,
      paragraphs: [
        '1. ¿Qué son las cookies?: Las cookies son pequeños archivos de texto que se almacenan en su navegador cuando visita casi cualquier página web. Su utilidad es que la web sea capaz de recordar su visita cuando vuelva a navegar por esa página.',
        '2. Tipos de cookies utilizadas: Esta web utiliza cookies técnicas (necesarias para el funcionamiento, como recordar su aceptación de cookies) y cookies de análisis (para recopilar estadísticas anónimas de uso).',
        '3. Cookies propias: Utilizamos una cookie técnica llamada "cookie_consent" para saber si ya ha aceptado nuestro aviso de cookies y no mostrárelo de nuevo.',
        '4. Almacenamiento local (LocalStorage): Además de cookies, utilizamos el almacenamiento local de su navegador para guardar estadísticas de uso locales (visitas, descargas) de forma totalmente anónima.',
        '5. Cookies de terceros: Podríamos utilizar servicios de terceros como Supabase para la gestión de estadísticas agregadas. Estos servicios pueden utilizar sus propias cookies bajo sus correspondientes políticas de privacidad.',
        '6. Google Fonts: Para el diseño tipográfico premium, esta web carga fuentes desde los servidores de Google, lo que podría implicar la recogida anónima de algunos datos técnicos por su parte.',
        '7. Desactivación o eliminación: En cualquier momento podrá ejercer su derecho de desactivación o eliminación de cookies de este sitio web. Estas acciones se realizan de forma diferente en función del navegador que esté usando (Chrome, Firefox, Safari, Edge, etc.).',
        '8. Consecuencias de la desactivación: Si desactiva las cookies técnicas, es posible que algunas funcionalidades de la web (como el banner de consentimiento) no se comporten correctamente.',
        '9. Garantías adicionales: Ni esta web ni sus representantes legales se hacen responsables ni del contenido ni de la veracidad de las políticas de privacidad que puedan tener los terceros mencionados en esta política de cookies.',
        '10. Aceptación de la política: El uso de "Generador GML" implica que usted acepta el uso de cookies en los términos aquí expresados.'
      ]
    }
  };

  const selected = content[type] || content.legal;

  return (
    <div className="modal-overlay">
      <div className="modal-content glass-panel" style={{ maxWidth: '600px', width: '95vw', maxHeight: '80vh', overflowY: 'auto', borderRadius: '0px' }}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {selected.icon}
            <h2 style={{ fontSize: '1.1rem', margin: 0, textTransform: 'uppercase' }}>{selected.title}</h2>
          </div>
          <button onClick={onClose} className="close-btn"><X size={24} /></button>
        </div>

        <div style={{ padding: '20px 0' }}>
          {selected.paragraphs.map((p, i) => (
            <p key={i} style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '15px', lineHeight: '1.6' }}>
              {p}
            </p>
          ))}

          <div style={{ marginTop: '30px', borderTop: '1px solid var(--border-color)', paddingTop: '20px' }}>
            <button className="btn btn-primary" onClick={onClose} style={{ width: '100%', height: '45px' }}>
              Entendido
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
