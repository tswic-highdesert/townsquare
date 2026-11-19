/**
 * Contribute: the chooser, the composers, drafts, outcomes and history.
 * "Listing" (a directory entry for a business) is "ficha" throughout.
 */

import type { Entry } from '../index.js'

export const strings: Record<string, Entry> = {
  // contributeData.ts: type nouns, event categories, correction fields
  event: 'evento',
  correction: 'corrección',
  notice: 'aviso',
  collection: 'colección',
  photo: 'foto',
  music: 'música',
  church: 'iglesia',
  sport: 'deporte',
  market: 'mercado',
  kids: 'infantil',
  civic: 'cívico',
  Phone: 'Teléfono',
  Hours: 'Horario',
  Address: 'Dirección',
  Name: 'Nombre',
  'Closed for good': 'Cerrado permanentemente',

  // contributeData.ts: notice severities
  'A notice': 'Un aviso',
  'Appears under Notices and in the week ahead. Nobody makes a sound.':
    'Aparece en Avisos y en la semana que viene. No suena ningún teléfono.',
  'most notices': 'la mayoría de los avisos',
  'Time sensitive': 'Por tiempo limitado',
  'A quiet push, and it stays at the top of Today until it passes.':
    'Una notificación discreta, y se queda arriba en Hoy hasta que pase.',
  Urgent: 'Urgente',
  'Wakes up every phone in Russellville, tonight, including people asleep. Held for a moderator before it sends.':
    'Hace sonar todos los teléfonos de Russellville, esta noche, incluso los de quienes duermen. Queda en espera de un moderador antes de enviarse.',

  // contributeData.ts: errors the shell writes when the connection fails
  'We could not confirm your submission. Your text is still here. Check your contributions before trying again.':
    'No pudimos confirmar su envío. Su texto sigue aquí. Revise sus contribuciones antes de intentarlo de nuevo.',
  'Draft not saved. Keep this page open and try again when your connection returns.':
    'El borrador no se guardó. Mantenga esta página abierta e inténtelo de nuevo cuando vuelva la conexión.',
  'We could not confirm the withdrawal. Check the status and try again.':
    'No pudimos confirmar el retiro. Revise el estado e inténtelo de nuevo.',

  // Contribute.tsx
  'The latest status could not be loaded. Your confirmed submission is unchanged. Try again in a moment.':
    'No se pudo cargar el estado más reciente. Su envío confirmado no cambió. Inténtelo de nuevo en un momento.',
  'Sign in to add something.': 'Inicie sesión para agregar algo.',
  'Everything you add carries your handle, so we need to know who you are first.':
    'Todo lo que agregue lleva su nombre de usuario, así que primero necesitamos saber quién es usted.',
  'We could not load this.': 'No pudimos cargar esto.',
  'Try again in a moment.': 'Inténtelo de nuevo en un momento.',
  'Your submission was sent, but its draft could not be removed. Check Drafts before sending it again.':
    'Su envío se realizó, pero no se pudo quitar el borrador. Revise sus borradores antes de enviarlo otra vez.',
  'We could not confirm that the draft was removed. It is still shown here; try again.':
    'No pudimos confirmar que se quitó el borrador. Todavía aparece aquí; inténtelo de nuevo.',
  'What you have added': 'Lo que ha agregado',
  'Add something': 'Agregar algo',
  '{count} drafts, not posted yet': {
    one: '{count} borrador, aún sin publicar',
    other: '{count} borradores, aún sin publicar',
  },
  'Throw this draft away?': '¿Desechar este borrador?',
  '"{title}", with everything you already put in. This one is a real delete, not a version, because a draft was never published and there is nothing to keep a history of.':
    '"{title}", con todo lo que ya escribió. Esto se borra de verdad, no queda como una versión, porque un borrador nunca se publicó y no hay historial que guardar.',
  'Keep it': 'Conservarlo',
  'Throw it away': 'Desecharlo',
  Back: 'Volver',
  'Sending…': 'Enviando…',
  Adding: 'Agregando',
  'An event': 'Un evento',
  'Post event': 'Publicar evento',
  Correcting: 'Corrigiendo',
  'A listing': 'Una ficha',
  'Send correction': 'Enviar corrección',
  Posting: 'Publicando',
  'Publish notice': 'Publicar aviso',
  Making: 'Creando',
  'A collection': 'Una colección',
  'Publish collection': 'Publicar colección',

  // Chooser.tsx
  'Something happening at a time and a place that people can turn up to.':
    'Algo que pasa en un lugar y a una hora, y a lo que la gente puede ir.',
  'Hours, a phone number or a name that is wrong on a listing.':
    'Un horario, un teléfono o un nombre que está mal en una ficha.',
  'An organisation telling the town something. Verified organisations only.':
    'Una organización que le comunica algo a la ciudad. Solo organizaciones verificadas.',
  'Places or stories you have gathered into a list with a name.':
    'Lugares o noticias que reunió en una lista con nombre.',
  'One picture of something in town, and one line saying what it is.':
    'Una foto de algo en la ciudad y una línea que diga qué es.',
  'Pick what it is. Everything in Town Square has a shape, so it can be found again.':
    'Elija qué es. Todo en Town Square tiene una forma, para que se pueda volver a encontrar.',
  'There is no general post box here, on purpose.':
    'Aquí no hay un espacio para publicar de todo, y es a propósito.',
  'You can write it now. It posts the moment you are verified.':
    'Puede escribirlo ahora. Se publica en cuanto se verifique su cuenta.',
  'Not available yet': 'Todavía no disponible',
  Locked: 'Bloqueado',

  // ComposerShell.tsx
  'Write or preview': 'Escribir o ver la vista previa',
  Write: 'Escribir',
  Preview: 'Vista previa',
  'Save draft': 'Guardar borrador',
  Saving: 'Guardando',
  'Not saved — keep this page open': 'No guardado. Mantenga esta página abierta',
  Saved: 'Guardado',
  'Contributing as {handle}': 'Contribuye como {handle}',
  'Posting as {handle}, through {creation}': 'Publica como {handle}, a través de {creation}',
  'Posting as {org}, by @{handle}': 'Publica como {org}, por @{handle}',
  'Kept up to date by {creation}, owned by @{owner}':
    'Mantenido al día por {creation}, propiedad de @{owner}',
  'From {source}': 'Fuente: {source}',

  // CollectionComposer.tsx
  'Call it something.': 'Póngale un nombre.',
  'A collection needs at least one thing in it.': 'Una colección necesita al menos un elemento.',
  '{item} moved to position {position} of {total}': '{item} pasó a la posición {position} de {total}',
  'Call it something': 'Póngale un nombre',
  'A line about it': 'Una línea sobre la colección',
  'Optional.': 'Opcional.',
  'In this collection': 'En esta colección',
  'Nothing in it yet. Find a place below.': 'Todavía está vacía. Busque un lugar abajo.',
  'Move {item} up': 'Subir {item}',
  'Move {item} down': 'Bajar {item}',
  'Remove {item}': 'Quitar {item}',
  'Add a place': 'Agregar un lugar',
  'Find a listing': 'Buscar un lugar',
  Results: 'Resultados',

  // CorrectionComposer.tsx
  'Pick the listing you are correcting.': 'Elija la ficha que va a corregir.',
  'It needs the corrected value.': 'Falta el valor corregido.',
  'A reason is required. It is what a reviewer reads.':
    'El motivo es obligatorio. Es lo que lee quien revisa.',
  'Pick the one thing that is wrong. One correction, one field, so it can be accepted or turned down on its own.':
    'Elija lo único que está mal. Una corrección, un campo, para que se pueda aceptar o rechazar por separado.',
  'Which listing': 'Qué ficha',
  'Which field': 'Qué campo',
  'On the listing now': 'Lo que aparece ahora',
  'Nothing is listed for this yet': 'Todavía no hay nada para esto',
  'From the directory import': 'De la importación del directorio',
  'Your correction': 'Su corrección',
  'Corrected value': 'Valor corregido',
  'How do you know': 'Cómo lo sabe',
  'A reason is required. It is what a reviewer actually reads.':
    'El motivo es obligatorio. Es lo que de verdad lee quien revisa.',
  'This becomes a new version of the listing. The current one stays exactly as it is and anyone, including you, can put it back. Nothing here is deleted.':
    'Esto se convierte en una nueva versión de la ficha. La actual queda exactamente como está y cualquier persona, incluso usted, puede restaurarla. Aquí no se borra nada.',

  // Drafts.tsx
  'Nothing half-written.': 'Nada a medio escribir.',
  'Anything you start is kept here automatically, even if you close the app in the middle of it.':
    'Todo lo que empiece se guarda aquí automáticamente, aunque cierre la aplicación a la mitad.',
  'Your drafts': 'Sus borradores',
  'Drafts are kept for 90 days, then tidied away':
    'Los borradores se guardan 90 días y luego se eliminan',
  'Throw away {title}': 'Desechar {title}',
  'Drafts are yours alone. Nobody else can see one, not a moderator, not an organisation you help run.':
    'Sus borradores son solo suyos. Nadie más puede verlos, ni un moderador ni una organización que usted ayude a dirigir.',
  'Needs a name before it can post': 'Necesita un nombre para publicarse',
  'Needs a start time before it can post': 'Necesita una hora de inicio para publicarse',
  'Needs the corrected value': 'Falta el valor corregido',
  'Needs a reason before it can be sent': 'Necesita un motivo para enviarse',
  'Needs a line saying what it is': 'Necesita una línea que diga qué es',
  'Needs a name': 'Necesita un nombre',
  'Needs at least one thing in it': 'Necesita al menos un elemento',
  'just now': 'hace un momento',
  yesterday: 'ayer',
  '{count} minutes ago': { one: 'hace {count} minuto', other: 'hace {count} minutos' },
  '{count} hours ago': { one: 'hace {count} hora', other: 'hace {count} horas' },
  '{count} days ago': 'hace {count} días',

  // EventComposer.tsx
  'It needs a name.': 'Falta el nombre.',
  'It needs a start time you have confirmed.': 'Falta una hora de inicio confirmada.',
  'What is it called': 'Cómo se llama',
  'How a neighbour would say it, not how a flyer would print it.':
    'Como lo diría un vecino, no como aparecería en un volante.',
  Where: 'Dónde',
  'Linked to the listing, so the event moves if their address does.':
    'Vinculado a la ficha, así que el evento cambia de lugar si cambia su dirección.',
  Category: 'Categoría',
  'What should people know': 'Qué debe saber la gente',
  'Plain sentences. No all caps.': 'Oraciones sencillas. Nada escrito todo en mayúsculas.',
  Cost: 'Costo',
  Free: 'Gratis',
  'Costs money': 'Con costo',
  Donation: 'Donación',
  'Free is the default because most of what happens here is.':
    'Gratis es la opción predeterminada porque casi todo lo que pasa aquí lo es.',
  'This is exactly how it will appear in the week ahead.':
    'Así es exactamente como aparecerá en la semana que viene.',
  'No time set': 'Sin hora',
  Untitled: 'Sin título',
  'Added by @{handle}': 'Agregado por @{handle}',
  'Your name is on it. That is not a warning, it is how anyone reading knows a person in town put it there.':
    'Lleva su nombre. No es una advertencia: así quien lo lea sabe que lo publicó una persona de la ciudad.',

  // History.tsx
  'That record is not there any more.': 'Ese registro ya no existe.',
  History: 'Historial',
  '{count} versions. Everything that has ever been on this record is still here.': {
    one: 'Una versión. Todo lo que ha estado en este registro está aquí.',
    other: '{count} versiones. Todo lo que ha estado en este registro sigue aquí.',
  },
  'Version {version}': 'Versión {version}',
  'on the record now': 'vigente',
  'Putting a version back does not erase the ones after it. It writes a new version that copies an old one, which is why nobody can quietly rewrite what happened here.':
    'Restaurar una versión no borra las posteriores. Se escribe una nueva versión que copia una anterior, y por eso nadie puede reescribir en silencio lo que pasó aquí.',
  Created: 'Creado',
  'A moderator put version {version} back': 'Un moderador restauró la versión {version}',
  '@{handle}, through {creation}': '@{handle}, a través de {creation}',
  '{org}, by @{handle}': '{org}, por @{handle}',
  '{creation}, owned by @{owner}': '{creation}, propiedad de @{owner}',

  // NoticeGate.tsx
  'The notice needs a line saying what it is.': 'El aviso necesita una línea que diga qué es.',
  'It needs the detail underneath.': 'Faltan los detalles.',
  'Notices come from organisations': 'Los avisos vienen de organizaciones',
  'A notice goes out under an organisation name, so residents know who is telling them.':
    'Un aviso sale con el nombre de una organización, para que los residentes sepan quién les informa.',
  'The library, a church, the school district, a city department. Your account is a person, so this one is not open to you yet.':
    'La biblioteca, una iglesia, el distrito escolar, un departamento de la ciudad. Su cuenta es de una persona, así que esto todavía no está disponible para usted.',
  'If you run something in town, or you help run it, we can attach you to it. It takes a couple of days and a person reads it.':
    'Si usted dirige algo en la ciudad, o ayuda a dirigirlo, podemos vincular su cuenta. Toma un par de días y una persona lo revisa.',
  'Claiming an organisation is not built yet. Email a moderator and they will sort it out.':
    'Todavía no se puede reclamar una organización. Escríbale un correo a un moderador y lo resolverá.',
  'Or, if what you have is one of these': 'O, si lo que tiene es una de estas cosas',
  'Something is happening.': 'Algo va a pasar.',
  'That is an event, and anyone verified can add one.':
    'Eso es un evento, y cualquier persona verificada puede agregar uno.',
  'Add an event': 'Agregar un evento',
  'Something is wrong on a listing.': 'Algo está mal en una ficha.',
  'That is a correction.': 'Eso es una corrección.',
  'Correct a listing': 'Corregir una ficha',
  'Water is out on your street right now.': 'No hay agua en su calle ahora mismo.',
  'Ring the city. We are not an emergency service and we will not pretend to be.':
    'Llame a la alcaldía. No somos un servicio de emergencias y no vamos a fingir que lo somos.',
  'The notice': 'El aviso',
  Detail: 'Detalles',
  'Say it the way you would say it from the pulpit.': 'Dígalo como lo diría desde el púlpito.',
  'How far this goes': 'Hasta dónde llega',
  'Supper time changing is a notice. Urgent is for when somebody could get hurt. Nobody thinks less of you for using the quiet one, and everyone notices the loud one twice.':
    'Que cambie la hora de la cena es un aviso. Urgente es para cuando alguien podría salir lastimado. Nadie piensa menos de usted por usar el nivel discreto, y todos notan dos veces el ruidoso.',

  // Outcome.tsx
  'Already sent': 'Ya enviada',
  'You already sent this one.': 'Usted ya envió esto.',
  'We kept the first one rather than making a second, so a moderator reads it once. Nothing was lost and nothing was duplicated.':
    'Conservamos el primero en lugar de crear otro, para que un moderador lo lea una sola vez. No se perdió ni se duplicó nada.',
  Live: 'Publicada',
  'It is up.': 'Ya está publicado.',
  'Editing it makes a new version, and the old one stays where it is.':
    'Si lo edita, se crea una nueva versión y la anterior se queda donde está.',
  'See its history': 'Ver su historial',
  Done: 'Listo',
  'Needs vouching': 'Necesita aval',
  'Saved, and it will post the moment you are verified.':
    'Guardado. Se publicará en cuanto se verifique su cuenta.',
  'Adding this is for verified residents. You need neighbours to vouch for you, and we are holding this for you until they have. Nothing is lost.':
    'Agregar esto es solo para residentes verificados. Necesita que sus vecinos le den su aval, y lo guardamos hasta que lo hagan. No se pierde nada.',
  Scheduled: 'Programada',
  'Goes out {when}.': 'Se publica el {when}.',
  'Goes out at the time you set.': 'Se publica a la hora que usted fijó.',
  'Nobody can see it before then, including you on another device. You can pull it back any time before it sends.':
    'Nadie puede verlo antes, ni siquiera usted en otro dispositivo. Puede retirarlo en cualquier momento antes de que se envíe.',
  'Being read': 'En revisión',
  'A moderator has this.': 'Un moderador lo está revisando.',
  "Corrections are read by a person before they change the town's record. You will see the answer in your list either way, with whatever they wrote.":
    'Una persona lee las correcciones antes de que cambien el registro de la ciudad. Verá la respuesta en su lista en cualquier caso, con lo que le hayan escrito.',
  'A moderator did not put this one up, and left you a note.':
    'Un moderador no publicó esto y le dejó una nota.',
  'Nothing was deleted. What you wrote is exactly as you wrote it.':
    'No se borró nada. Lo que escribió está exactamente como lo escribió.',
  'A moderator': 'Un moderador',
  'Withdraw it': 'Retirarlo',
  'Turned down': 'No aprobada',
  Withdrawn: 'Retirada',
  'Hold on a second': 'Un momento',
  'Nothing today': 'Nada hoy',
  'One today': 'Uno hoy',
  'Two today': 'Dos hoy',
  'Three today': 'Tres hoy',
  'Four today': 'Cuatro hoy',
  'Five today': 'Cinco hoy',
  'Six today': 'Seis hoy',
  'Seven today': 'Siete hoy',
  'Eight today': 'Ocho hoy',
  'Nine today': 'Nueve hoy',
  '{count} today': '{count} hoy',
  'You can post again {when}.': 'Puede volver a publicar el {when}.',
  'Save this as a draft': 'Guardar como borrador',
  'If you run the market or the school calendar and this is genuinely not enough, say so and we will raise yours. That takes a message, not an application.':
    'Si usted organiza el mercado o el calendario escolar y esto de verdad no le alcanza, díganoslo y le subiremos el límite. Basta con un mensaje, no hace falta una solicitud.',
  'You have not added anything yet.': 'Todavía no ha agregado nada.',
  'An event, a correction to a listing, or a collection. Whatever you add carries your handle, and you can always take it back.':
    'Un evento, una corrección a una ficha o una colección. Todo lo que agregue lleva su nombre de usuario, y siempre puede retirarlo.',
  '{count} min ago': 'hace {count} min',
  '{count}h ago': 'hace {count} h',

  // PhotoUnavailable.tsx
  'Photos are not open yet': 'Las fotos todavía no están disponibles',
  'Sharing a photo needs somewhere to put the file and an EXIF strip before it lands, and Town Square has no image store yet.':
    'Para compartir una foto hace falta un lugar donde guardar el archivo y quitarle los datos EXIF antes de que llegue, y Town Square todavía no tiene dónde guardar imágenes.',
  "When it opens, your phone's copy of the picture will still have the exact coordinates of wherever you took it written inside the file. We will take that out, along with the camera serial, before anything leaves your phone, and we will say so on the screen at the moment it happens. That is the part worth waiting for.":
    'Cuando se habilite, la copia de la foto en su teléfono todavía tendrá escritas dentro del archivo las coordenadas exactas del lugar donde la tomó. Las quitaremos, junto con el número de serie de la cámara, antes de que nada salga de su teléfono, y lo diremos en la pantalla en el momento en que ocurra. Eso es lo que vale la pena esperar.',
  'In the meantime': 'Mientras tanto',
  'If the photo is of something happening, the thing itself is an event and anyone verified can add one.':
    'Si la foto es de algo que sucede, eso en sí es un evento y cualquier persona verificada puede agregarlo.',

  // PlacePicker.tsx
  'From the directory': 'Del directorio',
  'A name you typed, no address stored': 'Un nombre que usted escribió, sin dirección guardada',
  'Clear {place}': 'Quitar {place}',
  optional: 'opcional',
  'Find a place in town': 'Buscar un lugar en la ciudad',
  Places: 'Lugares',
  'Somewhere else': 'Otro lugar',
  'Use "{name}" as a place name. No street address, ever.':
    'Usar "{name}" como nombre del lugar. Nunca una dirección.',

  // WhenField.tsx
  When: 'Cuándo',
  'However you would say it out loud.': 'Como lo diría en voz alta.',
  'We read that as {reading}. Is that right?': 'Entendimos {reading}. ¿Es correcto?',
  Yes: 'Sí',
  'Set it myself': 'Prefiero ponerla yo',
  'Two readings of that. Which one?': 'Eso se puede entender de dos maneras. ¿Cuál es?',
  'Nothing is picked for you. A market at 7am and a game at 7pm are both normal here.':
    'No elegimos por usted. Aquí es normal tanto un mercado a las 7 a.m. como un partido a las 7 p.m.',
  'We found {day}, but no time in that.': 'Encontramos {day}, pero no una hora.',
  'Set the time by hand': 'Poner la hora a mano',
  'Add a time to the line above, or set it here.':
    'Agregue una hora en la línea de arriba o póngala aquí.',
  'We could not find a date in that. Try a day and a time, or set it by hand.':
    'No encontramos una fecha en eso. Pruebe con un día y una hora, o póngala a mano.',
  'Set it by hand': 'Ponerla a mano',
  'The words you typed are kept. Nothing you wrote was thrown away.':
    'Lo que escribió se conserva. No se desechó nada.',
  'You set this by hand. We stopped guessing.': 'Usted la puso a mano. Ya no intentamos adivinar.',
  Date: 'Fecha',
  Starts: 'Empieza',
  'A date and a time, and it is set.': 'Una fecha y una hora, y listo.',
  'Go back to typing it': 'Volver a escribirla',
}

export const review: Record<string, string> = {
  'A listing':
    '"Listing" (a business entry in the directory) is "ficha" everywhere in this area. Alternatives: "listado" (reads as a list) or "la información de un lugar" (what shell.ts uses in a sentence, too long for labels).',
  kids: 'Event category chip, shown capitalized by CSS. "Infantil" is one gender-neutral word; "Para niños" would be two words and CSS capitalizes both.',
  civic: 'Event category chip. "Cívico" is masculine to match an implied "evento"; check it reads naturally as a filter label.',
  'Closed for good': 'Correction field for a business that shut down. "Cerrado permanentemente" mirrors common map apps; "Cerró definitivamente" is the alternative.',
  'Time sensitive':
    'Middle notice severity: a quiet push that stays pinned until the event passes. "Por tiempo limitado" can read like a sale; "Con fecha límite" or "Importante por ahora" were considered.',
  'Appears under Notices and in the week ahead. Nobody makes a sound.':
    '"Nobody makes a sound" means no phone buzzes; rendered "No suena ningún teléfono". "La semana que viene" assumes the Today section is called that in Spanish.',
  'Wakes up every phone in Russellville, tonight, including people asleep. Held for a moderator before it sends.':
    'The urgent notice warning. It must make a sender stop and think; confirm it is strong enough.',
  'Supper time changing is a notice. Urgent is for when somebody could get hurt. Nobody thinks less of you for using the quiet one, and everyone notices the loud one twice.':
    'Tone-setting nudge with an idiom ("notices the loud one twice"). "Urgente" must match the severity name.',
  'Everything you add carries your handle, so we need to know who you are first.':
    '"Handle" rendered "nombre de usuario". Other areas may use "usuario" or keep "@handle"; align across the app.',
  'There is no general post box here, on purpose.':
    'Means there is no free-form "post anything" box. Rendered as "no space to post everything"; "buzón" was rejected because it reads as a mailbox.',
  'Pick what it is. Everything in Town Square has a shape, so it can be found again.':
    '"Shape" means a structured type. "Forma" is literal; "estructura" or "un tipo" are alternatives.',
  'You can write it now. It posts the moment you are verified.':
    'Verification wording. Rendered "once your account is verified" to avoid a gendered "verificado/a".',
  'Contributing as {handle}':
    'Attribution line on every composer, {handle} is bold "@name". Present tense "Contribuye como" chosen over the gerund "Contribuyendo como".',
  'Kept up to date by {creation}, owned by @{owner}':
    'Masculine "Mantenido" agrees with an implied "contenido". Alternative: "Lo actualiza {creation}, propiedad de @{owner}".',
  'How a neighbour would say it, not how a flyer would print it.':
    'Masculine generic "un vecino". "Volante" is the common Latin American word for flyer; "folleto" is the alternative.',
  'Saved, and it will post the moment you are verified.':
    'Verification wording, gender-neutral via "su cuenta".',
  'Adding this is for verified residents. You need neighbours to vouch for you, and we are holding this for you until they have. Nothing is lost.':
    'Vouching and verification. "Residentes verificados" and "sus vecinos" are masculine generic. "Le den su aval" avoids a gendered "lo/la avalen".',
  'Needs vouching': 'Status chip. "Necesita aval" per glossary; "Falta el aval" is an alternative.',
  'Turned down':
    'Status for a contribution a moderator declined. The code stresses this must not feel like a rejection, so "No aprobada" was chosen over "Rechazada".',
  Live: 'Status chip for a published contribution. Status chips here are feminine to agree with "contribución" (Publicada, Programada, Retirada, No aprobada, Ya enviada), which also matches the Today area. "En vivo" was rejected because it suggests streaming.',
  'A moderator put version {version} back':
    'Masculine generic "Un moderador". The role is named, never the person.',
  'A moderator did not put this one up, and left you a note.':
    'The one moment the platform tells someone no; tone matters most here. Masculine generic "Un moderador".',
  'Goes out {when}.':
    '{when} is a weekday and time from Intl in es-US, e.g. "sábado, 7:00 p.m.". Check "Se publica el sábado, 7:00 p.m." reads well.',
  'You can post again {when}.': 'Same {when} format as "Goes out {when}." with "el" before the weekday.',
  'One today':
    'Pause screen heading: how many posts today, spelled out. Masculine "Uno" assumes "envío"; "Una" would match "publicación" or "contribución".',
  'If you run something in town, or you help run it, we can attach you to it. It takes a couple of days and a person reads it.':
    'Organisation affiliation; "attach you to it" rendered as "link your account".',
  'Ring the city. We are not an emergency service and we will not pretend to be.':
    '"The city" means local government, so "la alcaldía" per glossary. Civic meaning: this tells people where to go in an outage.',
  'Say it the way you would say it from the pulpit.':
    'Idiom aimed at church secretaries posting notices. Literal rendering; check it does not read as odd or exclusive.',
  "When it opens, your phone's copy of the picture will still have the exact coordinates of wherever you took it written inside the file. We will take that out, along with the camera serial, before anything leaves your phone, and we will say so on the screen at the moment it happens. That is the part worth waiting for.":
    'Privacy promise about removing location and camera serial from photos. Check the commitment reads exactly as strong as the English.',
  'Sharing a photo needs somewhere to put the file and an EXIF strip before it lands, and Town Square has no image store yet.':
    '"EXIF strip" rendered "quitarle los datos EXIF". Privacy-related.',
  'Drafts are yours alone. Nobody else can see one, not a moderator, not an organisation you help run.':
    'Privacy statement about who can see drafts.',
  'Use "{name}" as a place name. No street address, ever.':
    'Privacy rule: the app never stores a street address. "Nunca una dirección" is short; "Nunca guardamos direcciones" is the stronger alternative.',
  'However you would say it out loud.':
    'The date parser is English-only (packages/contributions/src/when.ts), so a resident who follows this hint in Spanish will get "could not find a date". Kept as a straight translation; the placeholder above it is still English examples.',
  'We read that as {reading}. Is that right?':
    '{reading} comes from the server in English (e.g. "Saturday 14 June, 7pm") until the service localizes it.',
  'Set it myself': 'Button next to "Sí". "Prefiero ponerla yo" avoids a gendered "yo mismo/misma".',
  'Two readings of that. Which one?': 'Loose rendering: "That can be understood two ways. Which is it?"',
  'This becomes a new version of the listing. The current one stays exactly as it is and anyone, including you, can put it back. Nothing here is deleted.':
    'Version history promise. "Incluso usted" avoids a gendered "incluido/a".',
  'on the record now': 'Badge on the current version in History. "Vigente" is formal; "actual" is the plainer alternative.',
}
