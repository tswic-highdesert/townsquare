/**
 * The account, sign-in, verification and vouching screens, the search overlay,
 * and the shared UI kit. "Handle" is rendered "nombre de usuario" throughout.
 */

import type { Entry } from '../index.js'

export const strings: Record<string, Entry> = {
  // Account.tsx
  moderator: 'moderador',
  admin: 'administrador',
  'We could not sign you out. Check your connection and try again.':
    'No pudimos cerrar su sesión. Revise su conexión e intente de nuevo.',
  Back: 'Volver',
  'Signed in': 'Sesión iniciada',
  Vouching: 'Aval',
  'Vouching is a closure: only a verified resident can vouch, which is what stops one person minting a town. When a neighbour vouches for you, this is where you vouch for the next person.':
    'El aval funciona en circuito cerrado: solo un residente verificado puede avalar, y eso impide que una sola persona fabrique una ciudad entera. Cuando un vecino le dé su aval, aquí es donde usted avalará a la siguiente persona.',
  'What verified unlocks': 'Lo que habilita la verificación',
  Leaving: 'Salir',
  'Sign out': 'Cerrar sesión',
  'Sign out everywhere': 'Cerrar sesión en todas partes',
  'Signing out everywhere ends every session on every device and clears what this one remembered. It is the one account control a pseudonymous account has, so it is a plain button rather than a red one.':
    'Cerrar sesión en todas partes termina todas las sesiones en todos los dispositivos y borra lo que este recordaba. Es el único control que tiene una cuenta seudónima, por eso es un botón sencillo y no uno rojo.',

  // identity/SignIn.tsx
  'We could not reach Town Square. Check your connection and try again.':
    'No pudimos conectar con Town Square. Revise su conexión e intente de nuevo.',
  'Your corner of the River Valley': 'Su rincón del River Valley',
  'Make yourself at home': 'Siéntase como en casa',
  'Welcome back': 'Hola de nuevo',
  'Save places and stories for later, and help keep local information useful. Browsing is always open to everyone.':
    'Guarde lugares y noticias para después, y ayude a que la información local siga siendo útil. Cualquier persona puede explorar, siempre.',
  Handle: 'Nombre de usuario',
  'what your neighbors see': 'lo que ven sus vecinos',
  '3 to 24 characters. Letters, numbers, and . _ - only.':
    'De 3 a 24 caracteres. Solo letras, números y los signos . _ -',
  Password: 'Contraseña',
  'At least 12 characters. A few memorable words work well.':
    'Al menos 12 caracteres. Unas cuantas palabras fáciles de recordar funcionan bien.',
  'Create my account': 'Crear mi cuenta',
  'I already have an account': 'Ya tengo una cuenta',
  'New here? Create an account': '¿Primera vez aquí? Cree una cuenta',
  'No email, name, address, or phone required. Keep your password somewhere safe: password recovery is not available yet.':
    'No se pide correo electrónico, nombre, dirección ni teléfono. Guarde su contraseña en un lugar seguro: todavía no es posible recuperarla.',
  'An account lets you save and suggest corrections. It does not mark you as a verified resident.':
    'Con una cuenta puede guardar y sugerir correcciones. No le da la condición de residente verificado.',

  // identity/Verification.tsx
  'You are set up': 'Ya está todo listo',
  'Not verified': 'Sin verificar',
  'You can read everything, save places and stories, and suggest corrections. Your account is ready to use.':
    'Puede leer todo, guardar lugares y noticias, y sugerir correcciones. Su cuenta está lista para usar.',
  'Corrections go to a moderator before anything changes. Publishing events and creations needs verified residency; signing up does not grant it.':
    'Las correcciones pasan por un moderador antes de que cambie algo. Para publicar eventos y creaciones se necesita residencia verificada; crear una cuenta no la otorga.',
  'By a neighbour': 'Por un vecino',
  'By an admin': 'Por un administrador',
  'A neighbour said they know you live here. That is the whole record. No address was collected or stored at any point.':
    'Un vecino dijo que sabe que usted vive aquí. Ese es todo el registro. En ningún momento se pidió ni se guardó una dirección.',
  'An admin verified you directly, which is how the first residents of a town exist at all. No address was collected or stored at any point.':
    'Un administrador verificó su cuenta directamente, que es como llegan a existir los primeros residentes de una ciudad. En ningún momento se pidió ni se guardó una dirección.',
  'You can publish creations, report things, correct town data, and vouch for other people. Who vouched for you stays between you and them.':
    'Puede publicar creaciones, reportar contenido, corregir datos de la ciudad y avalar a otras personas. Quién le dio su aval queda entre usted y esa persona.',
  'Read the town square, browse the directory, open any creation':
    'Leer Town Square, explorar el directorio, abrir cualquier creación',
  'Save an event or a place': 'Guardar un evento o un lugar',
  'Build, validate and preview a creation': 'Crear, validar y previsualizar una creación',
  'Publish a creation that runs in a neighbour’s browser':
    'Publicar una creación que funciona en el navegador de un vecino',
  'Report a creation or a record': 'Reportar una creación o un registro',
  'Suggest a correction for moderator review': 'Sugerir una corrección para que la revise un moderador',
  'Vouch for a neighbour': 'Avalar a un vecino',
  'What each step gives you. Everything a person actually comes here for sits in the first column.':
    'Lo que le da cada paso. Todo lo que una persona realmente viene a buscar aquí está en la primera columna.',
  'You want to': 'Lo que quiere hacer',
  'Signed out': 'Sin sesión',
  Verified: 'Verificado',
  Yes: 'Sí',
  No: 'No',
  'Decide a submission, close a report, put an old version back':
    'Decidir sobre un envío, cerrar un reporte, restaurar una versión anterior',
  'Moderator, a role held by the local committee': 'Moderador, una función que ejerce el comité local',

  // identity/Vouching.tsx
  'You vouched for @{handle}. They can see the count went up, not who.':
    'Usted avaló a @{handle}. Esa persona verá que su conteo subió, pero no quién fue.',
  'Vouch for @{handle} withdrawn. They stay verified. The branch under them is flagged so a moderator reads it, and nothing anyone built comes down.':
    'Retiró su aval a @{handle}. Esa persona sigue verificada. La rama que depende de ella queda marcada para que la revise un moderador, y no se quita nada de lo que alguien haya creado.',
  None: 'Ninguno',
  'available today': 'disponible hoy',
  'of {budget} available': 'de {budget} disponibles',
  'You have not vouched for anyone yet': 'Todavía no ha avalado a nadie',
  '{count} are out with people you vouched for': {
    one: '{count} está con alguien a quien usted avaló',
    other: '{count} están con personas a quienes usted avaló',
  },
  '{available} of {budget} vouches available': '{available} de {budget} avales disponibles',
  'Vouches replenish on a rolling window, not a monthly reset: each one comes back {days} days after you give it. The limit is not a scarcity trick. Ten in ninety days is roughly the number of people anyone genuinely knows well enough to answer for, and it is what makes a chain worth auditing.':
    'Los avales se recuperan en un período móvil, no con un reinicio mensual: cada uno vuelve {days} días después de darlo. El límite no es un truco de escasez. Diez en noventa días es más o menos la cantidad de personas que alguien conoce de verdad lo bastante bien como para responder por ellas, y es lo que hace que valga la pena auditar una cadena.',
  'their handle': 'su nombre de usuario',
  'Someone you know lives in Russellville. Not someone who seems fine, and not someone you have only talked to online.':
    'Alguien que usted sabe que vive en Russellville. No alguien que parece buena persona, ni alguien con quien solo ha hablado por internet.',
  'Your name is on this.': 'Esto lleva su nombre.',
  'Vouch chains are visible to the committee, never to the town. If this one goes wrong, it traces back to you and a moderator will ask.':
    'Las cadenas de avales las ve el comité, nunca la ciudad. Si este aval sale mal, se rastrea hasta usted y un moderador le preguntará.',
  'Vouch for them': 'Avalar a esta persona',
  'Withdraw my vouch for @{handle} instead': 'Mejor retirar mi aval a @{handle}',
  'Withdraw your vouch for @{handle}?': '¿Retirar su aval a @{handle}?',
  'They stay verified. The branch under them is flagged so a moderator reads it, and nothing anyone built comes down. Withdrawing is a way to say “I am no longer sure”, not a way to remove someone.':
    'Esa persona sigue verificada. La rama que depende de ella queda marcada para que la revise un moderador, y no se quita nada de lo que alguien haya creado. Retirar un aval es una forma de decir “ya no tengo certeza”, no una forma de expulsar a alguien.',
  'Keep it': 'Conservarlo',
  'Withdraw it': 'Retirarlo',

  // identity/WhatWeHold.tsx
  vouch: 'aval',
  manual: 'manual',
  postcard: 'tarjeta postal',
  'What we hold about you': 'Lo que guardamos sobre usted',
  'Your handle,': 'Su nombre de usuario,',
  ', which the town sees.': ', que ve toda la ciudad.',
  'A salted password hash, used to check your password. We do not store the password itself or ask for your email.':
    'Un hash con sal de su contraseña, que se usa para comprobarla. No guardamos la contraseña en sí ni pedimos su correo electrónico.',
  'Two facts about verification: that you are not verified.':
    'Dos datos sobre la verificación: que su cuenta no está verificada.',
  'Two facts about verification: that you are verified, and that the method was {method}.':
    'Dos datos sobre la verificación: que su cuenta está verificada y que el método fue {method}.',
  'Two facts about verification: that you are verified.':
    'Dos datos sobre la verificación: que su cuenta está verificada.',
  'Which handles vouched for you, and which you vouched for. Committee only.':
    'Qué nombres de usuario le dieron su aval y a cuáles avaló usted. Solo los ve el comité.',
  'What you built and what you changed, with the date.': 'Lo que creó y lo que cambió, con la fecha.',
  'And what we do not': 'Y lo que no guardamos',
  'Your address. Not hashed, not once, not ever. There is no column.':
    'Su dirección. Ni en forma de hash, ni una sola vez, nunca. No existe esa columna.',
  'Your real name, unless you typed it into your handle yourself.':
    'Su nombre real, a menos que lo haya escrito usted en su nombre de usuario.',
  'Your phone number.': 'Su número de teléfono.',
  'Where you are. Nearby measures distances on your phone and tells us nothing.':
    'Dónde está usted. Cerca mide las distancias en su teléfono y no nos dice nada.',
  'A creation you open is handed your handle and whether you are verified, and that is the entire list. No email, no id it could join on, no vouch count.':
    'Una creación que usted abre recibe su nombre de usuario y si su cuenta está verificada, y esa es toda la lista. Sin correo electrónico, sin ningún identificador para cruzar datos, sin conteo de avales.',

  // identity/when.ts
  'waiting under an hour': 'esperando hace menos de una hora',
  'waiting {count} hours': { one: 'esperando hace {count} hora', other: 'esperando hace {count} horas' },
  'waiting {count} days': { one: 'esperando hace {count} día', other: 'esperando hace {count} días' },

  // session.ts
  'Something went wrong.': 'Algo salió mal.',

  // nav/Search.tsx and nav/searchIndex.ts
  Stories: 'Noticias',
  Events: 'Eventos',
  Places: 'Lugares',
  'Show all {count} stories': 'Ver las {count} noticias',
  'Show all {count} events': 'Ver los {count} eventos',
  'Show all {count} places': 'Ver los {count} lugares',
  'Show all {count} creations': 'Ver las {count} creaciones',
  Cancel: 'Cancelar',
  'Stories, events, places and creations, all at once.': 'Noticias, eventos, lugares y creaciones, todo a la vez.',
  Recent: 'Recientes',
  Clear: 'Borrar',
  Try: 'Pruebe con',
  'Searching happens on this device. Nothing you type is sent anywhere, and your recent searches are never used to rank anything.':
    'La búsqueda se hace en este dispositivo. Nada de lo que escribe se envía a ningún lado, y sus búsquedas recientes nunca se usan para ordenar resultados.',
  'Nothing in {place} is filed under {query}.': 'Nada en {place} coincide con {query}.',
  '{hits} in {count} groups.': { one: '{hits} en {count} grupo.', other: '{hits} en {count} grupos.' },
  '{count} results': { one: '{count} resultado', other: '{count} resultados' },
  "This searches today's stories, what is on today, every business in the directory, and everything neighbours have built. It does not reach back through the archive.":
    'Esta búsqueda abarca las noticias de hoy, lo que hay hoy en la agenda, cada negocio del directorio y todo lo que han creado los vecinos. No busca en el archivo.',
  'Know something we are missing?': '¿Sabe de algo que nos falta?',
  'Add it and it is in {place} for everyone, tonight.': 'Agréguelo y esta noche ya estará en {place} para todos.',
  'Add to the town': 'Agregar a la ciudad',
  'Still loading the rest of the directory.': 'Todavía se está cargando el resto del directorio.',
  '{tagline} · by {author}': '{tagline} · por {author}',

  // ui/
  '{count} neighbours': { one: '{count} vecino', other: '{count} vecinos' },
  'Remove the {label} filter': 'Quitar el filtro {label}',
  'One fewer {unit}': 'Uno menos ({unit})',
  'One more {unit}': 'Uno más ({unit})',
  'Try now': 'Intentar ahora',
  'Clear the search': 'Borrar la búsqueda',
  Item: 'Elemento',
  Dismiss: 'Descartar',
  '{label} removed. Nothing left in this list.': 'Se quitó {label}. No queda nada en esta lista.',
  '{label} removed. {count} items left.': {
    one: 'Se quitó {label}. Queda {count} elemento.',
    other: 'Se quitó {label}. Quedan {count} elementos.',
  },
}

export const review: Record<string, string> = {
  // Account and sign-in
  moderator: 'Role shown to its holder. Masculine generic; "moderación" or "equipo de moderación" are neutral alternatives.',
  admin: 'Masculine generic "administrador". Same gender question as "moderador".',
  Vouching:
    'Section heading. Glossary gives aval; "Avales" (plural) may read more naturally as a heading over a budget of vouches.',
  'Vouching is a closure: only a verified resident can vouch, which is what stops one person minting a town. When a neighbour vouches for you, this is where you vouch for the next person.':
    '"A closure" and "minting a town" are figurative (one person inventing a fake town of accounts). Rendered "circuito cerrado" and "fabrique una ciudad entera"; check it reads clearly.',
  'Signing out everywhere ends every session on every device and clears what this one remembered. It is the one account control a pseudonymous account has, so it is a plain button rather than a red one.':
    'Privacy/security meaning. "Cuenta seudónima" may be unfamiliar; "cuenta sin nombre real" is an alternative.',
  'Your corner of the River Valley':
    'Tone-setting eyebrow. Kept the place name "River Valley" in English; "Su rincón del Valle del Río Arkansas" was considered and rejected as a place-name translation.',
  'Make yourself at home': 'Idiom, sign-up headline. "Siéntase como en casa" is the standard equivalent.',
  'Welcome back':
    '"Bienvenido de nuevo" is gendered, so "Hola de nuevo" was used. Confirm it is warm enough for a sign-in headline.',
  Handle:
    'Account identifier label. "Nombre de usuario" chosen over "alias" or "seudónimo"; used for every "handle" in this area.',
  'No email, name, address, or phone required. Keep your password somewhere safe: password recovery is not available yet.':
    'Privacy promise and a warning about account recovery. Check it reads as reassurance plus a clear warning.',
  'An account lets you save and suggest corrections. It does not mark you as a verified resident.':
    'Civic distinction between an account and verified residency. Rephrased as "no le da la condición de" to avoid a gendered "lo marca".',

  // Verification
  'Corrections go to a moderator before anything changes. Publishing events and creations needs verified residency; signing up does not grant it.':
    'Civic rule about verification. "Residencia verificada" and "crear una cuenta" for "signing up"; confirm both read correctly.',
  'By a neighbour': 'Verification method pill. Masculine generic "vecino"; "Por aval de un vecino" is a longer, clearer option.',
  'By an admin': 'Masculine generic "administrador".',
  'A neighbour said they know you live here. That is the whole record. No address was collected or stored at any point.':
    'Privacy statement about what verification records. Must stay exact.',
  'You can publish creations, report things, correct town data, and vouch for other people. Who vouched for you stays between you and them.':
    'Privacy of the vouch chain. "Quién le dio su aval" used to avoid a gendered "lo avaló".',
  'Read the town square, browse the directory, open any creation':
    '"The town square" here plays on the product name. Rendered as the brand "Town Square"; "la plaza de la ciudad" would lose the reference.',
  'Moderator, a role held by the local committee': 'Civic role description; masculine generic "Moderador".',
  'Signed out': 'Table column header for a visitor who is not signed in. "Sin sesión" chosen over "Sin iniciar sesión" for width.',
  Verified: 'Masculine form, column header. "Con verificación" is a neutral alternative.',

  // Vouching
  'Vouch for @{handle} withdrawn. They stay verified. The branch under them is flagged so a moderator reads it, and nothing anyone built comes down.':
    'Explains moderation consequences of withdrawing a vouch. "La rama que depende de ella" for "the branch under them"; check the metaphor reads.',
  '{count} are out with people you vouched for':
    'Vouches currently in use. "Está con alguien a quien usted avaló" is literal; "en uso" was the alternative.',
  'Vouches replenish on a rolling window, not a monthly reset: each one comes back {days} days after you give it. The limit is not a scarcity trick. Ten in ninety days is roughly the number of people anyone genuinely knows well enough to answer for, and it is what makes a chain worth auditing.':
    '"Rolling window" rendered "período móvil"; "scarcity trick" as "truco de escasez". Check both sound natural.',
  'Someone you know lives in Russellville. Not someone who seems fine, and not someone you have only talked to online.':
    'The core vouching rule. "Parece buena persona" for "seems fine".',
  'Your name is on this.': 'Idiom about accountability. "Esto lleva su nombre" chosen over "Usted responde por esto".',
  'They stay verified. The branch under them is flagged so a moderator reads it, and nothing anyone built comes down. Withdrawing is a way to say “I am no longer sure”, not a way to remove someone.':
    '"Ya no estoy seguro" is gendered, so "ya no tengo certeza" was used inside the quote.',

  // What we hold
  'What we hold about you': 'Privacy section heading. "Guardamos" for "hold"; "tenemos" is an alternative.',
  'Your handle,':
    'Split around a bold handle: "Su nombre de usuario, @x, que ve toda la ciudad." Read the two halves together.',
  'A salted password hash, used to check your password. We do not store the password itself or ask for your email.':
    'Technical privacy statement. "Hash con sal" is the usual term but may confuse lay readers.',
  'Two facts about verification: that you are verified, and that the method was {method}.':
    '{method} is aval, manual or tarjeta postal. Phrased around "su cuenta" to stay gender-neutral.',
  'Your address. Not hashed, not once, not ever. There is no column.':
    'Emphatic privacy promise with rhythm in English. Check the Spanish keeps the force.',
  'Where you are. Nearby measures distances on your phone and tells us nothing.':
    '"Cerca" is the tab name for Nearby; in a sentence it may need quotes or capitalisation to read as a name.',
  'A creation you open is handed your handle and whether you are verified, and that is the entire list. No email, no id it could join on, no vouch count.':
    'Data shared with third-party creations. "Identificador para cruzar datos" for "id it could join on".',

  // Moderation time and search
  'waiting {count} days':
    'Moderation queue age. "Esperando hace" chosen; "lleva {count} días esperando" or "en espera: {count} días" are alternatives.',
  'Searching happens on this device. Nothing you type is sent anywhere, and your recent searches are never used to rank anything.':
    'Privacy promise about search.',
  'Nothing in {place} is filed under {query}.':
    '"Filed under" idiom rendered as "coincide con". {query} is what the resident typed.',
  'Add it and it is in {place} for everyone, tonight.': 'Invitation to contribute; tone-setting.',
  Try: 'Group label above suggested searches. "Pruebe con" chosen over "Sugerencias".',

  // UI kit
  'One fewer {unit}':
    'Stepper button label; {unit} is a caller-supplied noun of unknown gender, so "Uno menos ({unit})" avoids agreement.',
  Dismiss: 'Close button on a toast. "Descartar" chosen; "Cerrar" also works but is the glossary value for Close.',
}
