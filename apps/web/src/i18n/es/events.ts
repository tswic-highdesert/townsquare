/**
 * The calendar: the day agenda, the month grid and one event. "Thing" on the
 * agenda is rendered "actividad" (feminine), so the count words agree with it.
 */

import type { Entry } from '../index.js'

export const strings: Record<string, Entry> = {
  // Events.tsx: counts read as words
  Nothing: 'Nada',
  One: 'Una',
  Two: 'Dos',
  Three: 'Tres',
  Four: 'Cuatro',
  Five: 'Cinco',
  Six: 'Seis',
  Seven: 'Siete',
  Eight: 'Ocho',
  Nine: 'Nueve',
  Ten: 'Diez',
  Eleven: 'Once',
  Twelve: 'Doce',
  Thirteen: 'Trece',
  Fourteen: 'Catorce',
  Fifteen: 'Quince',

  // Events.tsx: date labels the API sends in English
  'Today in {town}': 'Hoy en {town}',
  '{weekday} in {town}': '{weekday} en {town}',
  'Tomorrow, {date}': 'Mañana, {date}',
  today: 'hoy',
  'nothing on': 'sin actividades',
  '{count} things on': { one: '{count} actividad programada', other: '{count} actividades programadas' },
  'A quiet stretch, then it picks back up at {time}.':
    'Un rato tranquilo; las actividades vuelven a partir de {time}.',
  '{minutes} min': '{minutes} min',
  '{hours} hr': '{hours} h',
  '{hours} hr {minutes} min': '{hours} h {minutes} min',
  'to {time}': 'a {time}',

  // Events.tsx: the day
  Today: 'Hoy',
  'How to see the calendar': 'Vista del calendario',
  Day: 'Día',
  Month: 'Mes',
  'The calendar could not be loaded.': 'No se pudo cargar el calendario.',
  'Nothing is wrong with your connection as far as we can tell, so this is probably us.':
    'Hasta donde podemos ver, su conexión funciona bien, así que el problema probablemente es nuestro.',
  'Nothing on the calendar.': 'No hay nada en el calendario.',
  '{word} things on.': { one: '{word} actividad programada.', other: '{word} actividades programadas.' },
  '{word} have already finished.': { one: '{word} ya terminó.', other: '{word} ya terminaron.' },
  'Show {count} earlier today': {
    one: 'Mostrar {count} actividad anterior de hoy',
    other: 'Mostrar {count} actividades anteriores de hoy',
  },
  'Hide {count} earlier today': {
    one: 'Ocultar {count} actividad anterior de hoy',
    other: 'Ocultar {count} actividades anteriores de hoy',
  },
  'See the whole month': 'Ver todo el mes',
  'now, {time}': 'ahora, {time}',
  all: 'todo',
  day: 'el día',
  'No end time published': 'No se publicó la hora de fin',
  'Pick a day': 'Elegir un día',
  'Nothing on for {day}': 'No hay nada programado para el {day}',
  'Nobody scheduled anything and nothing is broken.': 'Nadie programó nada y todo funciona bien.',
  'There are {count} things on {day}.': {
    one: 'Hay {count} actividad el {day}.',
    other: 'Hay {count} actividades el {day}.',
  },
  'There are {count} things on today.': {
    one: 'Hay {count} actividad hoy.',
    other: 'Hay {count} actividades hoy.',
  },

  // Events.tsx: the month
  'The month could not be loaded.': 'No se pudo cargar el mes.',
  'Previous month': 'Mes anterior',
  'Next month': 'Mes siguiente',
  '{count} events': { one: '{count} evento', other: '{count} eventos' },
  '+{count} more': '+{count} más',
  'The day': 'El día',
  'Nothing on.': 'Nada programado.',
  'See all {count}': 'Ver todo ({count})',

  // EventDetail.tsx: when, in plain words and exactly
  'This morning': 'Esta mañana',
  'This afternoon': 'Esta tarde',
  'This evening': 'Esta noche',
  'Tomorrow morning': 'Mañana por la mañana',
  'Tomorrow afternoon': 'Mañana por la tarde',
  'Tomorrow evening': 'Mañana por la noche',
  'Yesterday morning': 'Ayer por la mañana',
  'Yesterday afternoon': 'Ayer por la tarde',
  'Yesterday evening': 'Ayer por la noche',
  'Today, all day': 'Hoy, todo el día',
  'Tomorrow, all day': 'Mañana, todo el día',
  'Yesterday, all day': 'Ayer, todo el día',
  '{day} morning': '{day} por la mañana',
  '{day} afternoon': '{day} por la tarde',
  '{day} evening': '{day} por la noche',
  '{day}, morning': '{day}, por la mañana',
  '{day}, afternoon': '{day}, por la tarde',
  '{day}, evening': '{day}, por la noche',
  '{day}, all day': '{day}, todo el día',
  '{day}, {start} to {end}': '{day}, de {start} a {end}',

  // EventDetail.tsx: the screen
  'This event could not be loaded': 'No se pudo cargar este evento',
  'Please try again in a moment.': 'Inténtelo de nuevo en un momento.',
  'Try again': 'Intentar de nuevo',
  'This listing is no longer on the calendar': 'Este evento ya no está en el calendario',
  'It was taken down at the source, or it has already happened and rolled off. Nothing on your end went wrong.':
    'Lo retiraron en la fuente, o ya pasó y salió del calendario. No hubo ningún problema de su lado.',
  'Back to the calendar': 'Volver al calendario',
  'The calendar': 'El calendario',
  'No end time published.': 'No se publicó la hora de fin.',
  'Could not update your saves. Please try again.': 'No se pudieron actualizar sus guardados. Intente de nuevo.',
  'Sign in to save this': 'Iniciar sesión para guardar esto',
  'Saving…': 'Guardando…',
  Saved: 'Guardado',
  'Save this': 'Guardar',
  'Open the original': 'Abrir el original',
  Where: 'Dónde',
  Directions: 'Cómo llegar',
  About: 'Detalles',
  'Also that day': 'Ese mismo día',
  'See the whole day': 'Ver todo el día',
  'From {source}': 'Fuente: {source}',
  'Last checked around {time}': 'Última revisión: alrededor de {time}',

  // categories.ts
  Civic: 'Cívico',
  Music: 'Música',
  Sport: 'Deporte',
  Community: 'Comunidad',

  // relative.ts: the chips
  'on now': 'en curso',
  'starting now': 'empieza ya',
  'in a minute': 'en un minuto',
  'in {minutes} min': 'en {minutes} min',
  'just started': 'acaba de empezar',
  'started {minutes} min ago': 'empezó hace {minutes} min',
  'started an hour ago': 'empezó hace una hora',
  'started {hours} hr ago': 'empezó hace {hours} h',
}

export const review: Record<string, string> = {
  One:
    'Count word at the start of "{word} actividades programadas" and "{word} ya terminó". Feminine "Una" to agree with "actividad"; if "thing" becomes "evento", this must become "Un" and the "ya terminó" sentence needs "Uno", which one key cannot do.',
  '{word} things on.':
    '"Thing" rendered "actividad" rather than "evento" so the count word agrees in gender across both sentences. Check it reads naturally as an agenda subtitle.',
  'nothing on':
    'Shown small inside an empty month cell and spoken in day labels. "Sin actividades" is longer than the English; "Nada" fits better but is terse when read aloud.',
  all: 'Split over two lines in the time column for an all-day row ("todo" / "el día"). Generic one-word keys; confirm the split reads well and fits the narrow column.',
  'A quiet stretch, then it picks back up at {time}.':
    'Written to avoid "a las {time}", which would be wrong at one o\'clock ("a la 1:00"). Alternative: "Un rato tranquilo, y luego se reanuda a las {time}."',
  'to {time}': 'End time under the start time in the agenda clock column ("7:00 pm / a 9:00"). "Hasta {time}" is the alternative.',
  'This evening':
    '"Evening" covers 5 pm onward. "Esta noche" for a 5:30 pm event may read late; "Esta tarde" is the alternative, but then it collides with "afternoon".',
  'Last checked around {time}':
    'Avoids the article before the clock time. Alternative: "Revisado por última vez cerca de las {time}".',
  'From {source}': 'Source line under an event. "Fuente: {source}" chosen over "De {source}", which reads ambiguously.',
  'on now': 'Status chip for an event in progress. "En curso" chosen; "Ahora" is shorter but vaguer.',
  'starting now': 'Countdown chip at zero minutes. Alternative: "Comienza ahora".',
  'Nothing is wrong with your connection as far as we can tell, so this is probably us.':
    'Casual, candid tone in an error message. Check the register still sounds natural with "usted".',
  'It was taken down at the source, or it has already happened and rolled off. Nothing on your end went wrong.':
    '"Rolled off" (dropped off the calendar after it happened) rendered "salió del calendario".',
  'Open the original': 'Link to the source website\'s own listing. Alternative: "Ver la publicación original".',
  About: 'Heading over an event\'s description. "Detalles" chosen over "Acerca de", which reads like a menu item.',
  Civic: 'Event category tag (council meetings, city business). "Cívico" is an adjective standing alone; "Vida cívica" or "Gobierno" are alternatives.',
  Sport: 'Event category tag. Singular "Deporte" to match the English; "Deportes" is more common as a section label.',
  'Show {count} earlier today': 'Toggle that reveals today\'s finished events. Wording is long for a button; check it reads naturally.',
  'See all {count}': 'Button under a day panel listing the first four events. "Ver todo ({count})" avoids gender agreement with the noun.',
  '{day}, morning':
    'Plain-words date for events more than a week out, e.g. "Lunes, 17 de agosto, por la mañana". Check the comma placement.',
  'Nothing on for {day}': 'Empty-day heading; {day} is a lowercase weekday ("miércoles").',
}
