import type { Entry } from '../index.js'

export const strings: Record<string, Entry> = {
  // Distances (nearbyData.ts)
  '{distance} ft': '{distance} pies',
  '{distance} mi': '{distance} mi',
  'Within {distance}': 'A menos de {distance}',

  // Group names the server writes, rendered with t(group.label) (parts.tsx)
  'Eat and drink': 'Comer y beber',
  Shop: 'Tiendas',
  'Auto and repair': 'Autos y reparaciones',
  'Health and care': 'Salud y cuidado',
  'Home and trades': 'Hogar y oficios',
  'Beauty and barber': 'Belleza y barbería',
  'Money and law': 'Finanzas y asuntos legales',
  'Stay the night': 'Hospedaje',
  'Outdoors and parks': 'Aire libre y parques',
  Learn: 'Aprender',
  Pets: 'Mascotas',
  'Kids and family': 'Niños y familia',
  'Fun and fitness': 'Diversión y ejercicio',
  Civic: 'Cívico',
  Services: 'Servicios',

  // Listing pieces (parts.tsx)
  'No photo of this {category}': 'Sin foto de este lugar ({category})',
  'No photo yet': 'Aún sin foto',
  'Call {name}': 'Llamar a {name}',
  'Directions to {name}': 'Cómo llegar a {name}',
  'Remove {name} from your saved things': 'Quitar {name} de sus guardados',
  'Save {name}': 'Guardar {name}',

  // Directory: load, save and missing states
  Directory: 'Directorio',
  'Could not remove this save. Please try again.': 'No se pudo quitar de sus guardados. Intente de nuevo.',
  'Could not save this place. Please try again.': 'No se pudo guardar este lugar. Intente de nuevo.',
  'Could not update your saves. Please try again.': 'No se pudieron actualizar sus guardados. Intente de nuevo.',
  'The directory could not be loaded.': 'No se pudo cargar el directorio.',
  'Try again': 'Intentar de nuevo',
  'Loading the directory': 'Cargando el directorio',
  'This place is no longer in the directory': 'Este lugar ya no está en el directorio',
  'The listing may have changed or been removed.': 'Es posible que la información haya cambiado o se haya eliminado.',
  'Browse the directory': 'Explorar el directorio',
  'The directory': 'El directorio',

  // Directory: search
  'Search {count} places': { one: 'Buscar en {count} lugar', other: 'Buscar en {count} lugares' },
  'A name, a street, or what it is': 'Un nombre, una calle o qué tipo de lugar es',
  'Type a few letters, or go back and let the directory pick something.':
    'Escriba algunas letras, o vuelva y deje que el directorio elija algo.',
  'Nothing in the directory matches "{query}".': 'Nada en el directorio coincide con "{query}".',

  // Directory: home
  'Find a new favorite.': 'Descubra un nuevo lugar favorito.',
  '{count} places around Russellville. Browse, wander, or search for something specific.': {
    one: '{count} lugar en Russellville y sus alrededores. Explore, recorra o busque algo específico.',
    other: '{count} lugares en Russellville y sus alrededores. Explore, recorra o busque algo específico.',
  },
  'Search places': 'Buscar lugares',
  '{withHours} public listings include readable hours. Hours are unknown for {unknownHours} others.':
    '{withHours} fichas públicas incluyen un horario legible. No se conoce el horario de otras {unknownHours}.',
  'Read on {date}.': 'Consultado el {date}.',
  'Show me something': 'Muéstreme algo',
  'One place at a time, drawn at random': 'Un lugar a la vez, elegido al azar',
  'Open by listed hours': 'Abiertos según el horario publicado',
  '{count} places': { one: '{count} lugar', other: '{count} lugares' },
  'Distance is worked out on your phone. We never receive your location.':
    'La distancia se calcula en su teléfono. Nunca recibimos su ubicación.',
  'Based on published hours. Call ahead to confirm before making a special trip.':
    'Según el horario publicado. Llame para confirmar antes de hacer el viaje.',
  'Location off': 'Ubicación desactivada',
  'Sort by how far away it is': 'Ordenar por distancia',
  'Showing what is open instead.': 'En su lugar, se muestra lo que está abierto.',
  'Your position stays on this device. The directory is downloaded and sorted here.':
    'Su ubicación se queda en este dispositivo. El directorio se descarga y se ordena aquí.',
  'Use my location': 'Usar mi ubicación',
  'Browse by what it is': 'Explorar por tipo de lugar',
  Fewer: 'Menos',
  'All {count}': 'Ver todo ({count})',
  'Or by the exact words': 'O por las palabras exactas',
  '{count} in the scrape': { one: '{count} en los datos recopilados', other: '{count} en los datos recopilados' },
  'Show fewer': 'Mostrar menos',
  '{count} more': '{count} más',
  'Looking for something specific?': '¿Busca algo específico?',

  // Directory: a group or category
  'Explore the town': 'Explorar la ciudad',
  Browse: 'Explorar',
  '{total} in {town}.': '{total} en {town}.',
  '{count} open by listed hours.': {
    one: '{count} abierto según el horario publicado.',
    other: '{count} abiertos según el horario publicado.',
  },
  'Rolled up from {count} categories, including {list}.': 'Agrupa {count} categorías, entre ellas: {list}.',
  'Open now': 'Abierto ahora',
  Nearest: 'Más cerca',
  'What is open': 'Lo que está abierto',
  'A to Z': 'De la A a la Z',
  'Show these as cards': 'Mostrar como tarjetas',
  'Show these as a list': 'Mostrar como lista',
  Cards: 'Tarjetas',
  List: 'Lista',
  Map: 'Mapa',
  Showing: 'Se muestran',
  '{shown} of {total}': '{shown} de {total}',
  'Open now also hides {count} whose hours we could not read. They may well be open.': {
    one: 'Abierto ahora también oculta {count} lugar cuyo horario no pudimos leer. Es muy posible que esté abierto.',
    other: 'Abierto ahora también oculta {count} lugares cuyo horario no pudimos leer. Es muy posible que estén abiertos.',
  },
  'Map place categories': 'Categorías de lugares en el mapa',
  'All places': 'Todos los lugares',
  'View place & save': 'Ver lugar y guardar',
  'Nothing in here is open at this minute.': 'Nada de esto está abierto en este momento.',
  'Nothing in the directory matches that.': 'Nada en el directorio coincide con eso.',
  Listings: 'Lugares',

  // Directory: the place sheet
  'Saving…': 'Guardando…',
  'Saved · remove': 'Guardado · quitar',
  'Save this place': 'Guardar este lugar',
  'Suggest a correction': 'Sugerir una corrección',
  Call: 'Llamar',
  Directions: 'Cómo llegar',
  'Opens Maps': 'Abre Mapas',
  Website: 'Sitio web',
  'What we know, and where it came from': 'Lo que sabemos y de dónde viene',
  'Name, address and phone': 'Nombre, dirección y teléfono',
  'from the public listing, read on {date}.': 'de la ficha pública, consultada el {date}.',
  'from the public listing.': 'de la ficha pública.',
  Hours: 'Horario',
  'were not published in a form we could read, so we will not say whether it is open.':
    'no se publicó en un formato que podamos leer, así que no diremos si está abierto.',
  'Listed hours': 'Horario publicado',
  'suggest it is {status}. Hours can change; call the business to confirm.':
    'indica: {status}. El horario puede cambiar; llame al negocio para confirmar.',
  Photographs: 'Fotos',
  "are not ours. Nobody has added one yet, so the card draws a plate instead of somebody else's picture.":
    'no son nuestras. Nadie ha agregado una todavía, así que la tarjeta muestra un fondo de color en lugar de la foto de otra persona.',
  'Opens in a new tab': 'Se abre en una pestaña nueva',

  // Show me something (Stumble.tsx)
  'There is nothing in the directory to draw from.': 'No hay nada en el directorio para elegir.',
  'Back to the directory': 'Volver al directorio',
  Close: 'Cerrar',
  'Drawn from {total}': 'Elegido entre {total}',
  'See the listing': 'Ver detalles',
  'Show me another': 'Muéstreme otro',
  'Nothing is being scored and nothing is being saved unless you save it.':
    'Aquí no se lleva la cuenta de nada, y nada se guarda a menos que usted lo guarde.',
  'This one is {distance} away.': 'Este lugar está a {distance}.',
  '{count} more in the deck before anything repeats': {
    one: 'Queda {count} en el mazo antes de que algo se repita',
    other: 'Quedan {count} en el mazo antes de que algo se repita',
  },

  // The map (TownMap.tsx)
  'OpenStreetMap map of Russellville with {count} directory places': {
    one: 'Mapa de OpenStreetMap de Russellville con {count} lugar del directorio',
    other: 'Mapa de OpenStreetMap de Russellville con {count} lugares del directorio',
  },
  'Approximate directory map with {count} listings': {
    one: 'Mapa aproximado del directorio con {count} lugar',
    other: 'Mapa aproximado del directorio con {count} lugares',
  },
  'Centre on me': 'Centrar en mi ubicación',
  'Show the whole town': 'Mostrar toda la ciudad',
  'Zoom in': 'Acercar',
  'Zoom out': 'Alejar',
  'Map ©': 'Mapa ©',
  'OpenStreetMap contributors': 'colaboradores de OpenStreetMap',
  'Served by Town Square; no map provider receives your location.':
    'Servido por Town Square; ningún proveedor de mapas recibe su ubicación.',
  'Approximate streets from directory addresses. Places can be explored in the list if the map is unavailable.':
    'Calles aproximadas a partir de las direcciones del directorio. Si el mapa no está disponible, puede explorar los lugares en la lista.',
}

export const review: Record<string, string> = {
  'Find a new favorite.':
    'Tone-setting headline for the directory. Literal "Encuentre un nuevo favorito" sounded flat; "Descubra un nuevo lugar favorito" adds "lugar".',
  '{count} places around Russellville. Browse, wander, or search for something specific.':
    '"Wander" rendered "recorra"; "curiosee" or "dé una vuelta" were the alternatives.',
  'Show me something':
    'Button for a random draw. "Muéstreme algo" keeps usted; "Sorpréndame" is livelier and also fits.',
  'Show me another': '"Muéstreme otro" (otro lugar). "Otro, por favor" was the alternative.',
  'Distance is worked out on your phone. We never receive your location.':
    'Privacy promise about location. Confirm it reads as a firm guarantee.',
  'Your position stays on this device. The directory is downloaded and sorted here.':
    'Privacy promise about location. "Se queda" vs "permanece": chose the plainer verb.',
  'Served by Town Square; no map provider receives your location.':
    'Privacy promise on the map caption. "Servido por" may read stiff; "Ofrecido por" is an alternative.',
  'OpenStreetMap contributors':
    'OSM attribution (license requirement). "© colaboradores de OpenStreetMap" is the form OSM itself uses in Spanish; it sits after "Mapa ©".',
  'Browse by what it is': '"Explorar por tipo de lugar" rather than a literal "por lo que es".',
  'Or by the exact words':
    'Heading over chips of the raw scraped category names, which stay in English. Confirm the heading still makes sense when the chips are English.',
  '{count} in the scrape':
    '"Scrape" is internal jargon for the data pulled from public listings; rendered "datos recopilados".',
  'Rolled up from {count} categories, including {list}.':
    '{list} is lowercase English category names from the scrape. "Agrupa" vs "Reúne"; colon added before the English list.',
  'suggest it is {status}. Hours can change; call the business to confirm.':
    '{status} is the English open-state label from the API (e.g. "open until 5 pm"), so a colon introduces it. Rework if the API ever sends Spanish labels.',
  'from the public listing, read on {date}.':
    '{date} arrives from the API formatted in English ("19 November 2026"). "Ficha pública" for "public listing"; "anuncio" was the alternative.',
  'Read on {date}.': 'Same English date from the API. Masculine "Consultado" refers to the data (implicit "el directorio").',
  '{withHours} public listings include readable hours. Hours are unknown for {unknownHours} others.':
    '"Listing" rendered "ficha"; "otras" agrees with fichas.',
  'Open by listed hours':
    'Rail heading. Plural "Abiertos" refers to the places listed below; check it reads as a heading.',
  'Open now also hides {count} whose hours we could not read. They may well be open.':
    'Explains a filter side effect. "Abierto ahora" is the filter button name, so it is used as a subject; quotes or "El filtro Abierto ahora" are an alternative.',
  'Nothing is being scored and nothing is being saved unless you save it.':
    '"Llevar la cuenta" for "scoring"; meant as reassurance there is no game or tracking.',
  'No photo of this {category}':
    'Screen-reader label. {category} is an English scraped category, so "este lugar" avoids guessing its gender and the category goes in parentheses.',
  "are not ours. Nobody has added one yet, so the card draws a plate instead of somebody else's picture.":
    '"Plate" is the colored placeholder tile; rendered "fondo de color".',
  'Stay the night': 'Group name for hotels and lodging; "Hospedaje" rather than a literal phrase.',
  'Money and law': '"Finanzas y asuntos legales" (banks, insurance, lawyers). "Dinero y leyes" was the literal alternative.',
  Civic:
    'Group name for city hall and public offices. May also be used by the events area for an event category; values must match.',
  'Home and trades': '"Oficios" for trades (plumbers, electricians). Confirm it reads naturally.',
  'All {count}': 'Toggle that expands the 15 group tiles. "Ver todo ({count})" avoids choosing a gender for the hidden noun.',
}
