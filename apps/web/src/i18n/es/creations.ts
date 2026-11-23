/**
 * The build layer: the gallery, the trust and detail pages, a running
 * creation's chrome and failures, and the builder door. Creation names,
 * taglines, descriptions and type labels are the author's and stay as written.
 */

import type { Entry } from '../index.js'

export const strings: Record<string, Entry> = {
  // Shared words
  Back: 'Volver',
  Today: 'Hoy',
  Creations: 'Creaciones',
  Open: 'Abrir',
  Report: 'Reportar',
  'Sign in': 'Iniciar sesión',
  'Try again': 'Intentar de nuevo',
  'Town Square starter example': 'Ejemplo inicial de Town Square',

  // Gallery
  '{town} · made to be useful': '{town} · hecho para ser útil',
  'Small ideas. More connected.': 'Ideas pequeñas. Más conexión.',
  'Useful tools for a day in the River Valley, and a starting point for something you could make. Starter examples are labeled. Community creations will appear here as they are reviewed.':
    'Herramientas útiles para un día en River Valley y un punto de partida para algo que usted podría crear. Los ejemplos iniciales están señalados. Las creaciones de la comunidad aparecerán aquí a medida que se revisen.',
  'Town Square tools': 'Herramientas de Town Square',
  'Town Square tool': 'Herramienta de Town Square',
  'Make a day of it': 'Aproveche el día',
  'A coffee, a local event, somewhere to eat. Bring your favorite stops together.':
    'Un café, un evento local, un lugar para comer. Reúna sus paradas favoritas.',
  'Plan your day': 'Planee su día',
  'Around the corner': 'A la vuelta de la esquina',
  'Explore places across town and find their address, phone and published details.':
    'Explore lugares de toda la ciudad y encuentre su dirección, teléfono y datos publicados.',
  'Explore the map': 'Explorar el mapa',
  'Creation starters': 'Creaciones de ejemplo',
  'Examples of what can be built here. These are not resident endorsements or community activity.':
    'Ejemplos de lo que se puede crear aquí. No son recomendaciones de residentes ni actividad de la comunidad.',
  'Loading the gallery': 'Cargando la galería',
  'No creations published yet.': 'Todavía no hay creaciones publicadas.',
  'A useful local idea can start small. See how a creation connects to Town Square.':
    'Una idea local útil puede empezar en pequeño. Vea cómo una creación se conecta con Town Square.',
  'How it works': 'Cómo funciona',
  'Filter by tag': 'Filtrar por etiqueta',
  Everything: 'Todo',
  'Nothing is tagged {tag}.': 'Nada tiene la etiqueta {tag}.',
  'That shelf is empty for now.': 'Por ahora esta sección está vacía.',
  'Show everything': 'Mostrar todo',
  'Each creation declares its permissions before it opens. Starter examples show the platform’s capabilities; they are not submissions from local residents.':
    'Cada creación declara sus permisos antes de abrirse. Los ejemplos iniciales muestran lo que la plataforma puede hacer; no son envíos de residentes locales.',
  'Build one': 'Cree una',
  'Start with something you wish existed in town. A useful list, a local guide, a small tool. Learn how to connect an app and submit it for review.':
    'Empiece con algo que le gustaría que existiera en la ciudad. Una lista útil, una guía local, una pequeña herramienta. Aprenda a conectar una aplicación y enviarla a revisión.',
  'The next useful idea could be yours.': 'La próxima idea útil podría ser suya.',
  'You could make one': 'Usted podría crear una',

  // Touch strip on each card
  'Posts {types} as you': 'Publica {types} en su nombre',
  '{count} outside hosts': '{count} sitios externos',
  'Nothing leaves town': 'Nada sale de la ciudad',
  'Your handle': 'Su nombre de usuario',
  'Reads {types}': 'Lee {types}',
  'Reads the directory': 'Lee el directorio',
  'Remembers your settings': 'Recuerda su configuración',

  // Trust page
  'What it can touch': 'A qué puede acceder',
  'Leaves the visit': 'Queda después de la visita',
  'Leaves town': 'Sale de la ciudad',
  Background: 'En segundo plano',
  'Nothing here leaves the visit or leaves town.':
    'Nada de esto queda después de la visita ni sale de la ciudad.',
  'That is more than most.': 'Es más de lo habitual.',
  'One thing here outlives the visit. It is marked.':
    'Una cosa aquí queda después de la visita. Está marcada.',
  '{total} things here outlive the visit. They are marked.':
    '{total} cosas aquí quedan después de la visita. Están marcadas.',
  'One thing here leaves town. It is marked.': 'Una cosa aquí sale de la ciudad. Está marcada.',
  '{total} things here leave town. They are marked.':
    '{total} cosas aquí salen de la ciudad. Están marcadas.',
  '{total} things here outlive the visit, and {hosts} of them leave town.': {
    one: '{total} cosas aquí quedan después de la visita, y {hosts} de ellas sale de la ciudad.',
    other: '{total} cosas aquí quedan después de la visita, y {hosts} de ellas salen de la ciudad.',
  },
  'You do not have to open this.': 'No tiene por qué abrirla.',
  'Nothing on this page is an accusation. The committee approved it because it declared everything honestly, which is a different question from whether you want it.':
    'Nada en esta página es una acusación. El comité la aprobó porque declaró todo con honestidad, y eso es una pregunta distinta de si usted la quiere.',
  'Not now': 'Ahora no',
  'More about this creation': 'Más sobre esta creación',
  'Version {version}. Reviewed by a neighbour on the committee before it went up, and every update is read again.':
    'Versión {version}. Un vecino del comité la revisó antes de publicarse, y cada actualización se vuelve a leer.',

  // Trust lines written by describeManifest (the fixed ones)
  'Reads the town directory and calendar': 'Lee el directorio y el calendario de la ciudad',
  'Names, hours, addresses and events. The same things the website shows anyone.':
    'Nombres, horarios, direcciones y eventos. Lo mismo que el sitio web le muestra a cualquiera.',
  "Knows you're a verified resident": 'Sabe que usted es residente verificado',
  'Your handle and whether you are verified. Not your name, email or address.':
    'Su nombre de usuario y si está verificado. No su nombre, correo electrónico ni dirección.',
  'Shared records other residents contributed. It cannot change them.':
    'Registros compartidos que aportaron otros residentes. No puede cambiarlos.',
  'Asks the first time. Everything it writes is attributed to you and to this creation, and every version is kept.':
    'Pide permiso la primera vez. Todo lo que escribe se atribuye a usted y a esta creación, y se guardan todas las versiones.',
  'Remembers your settings for this app': 'Recuerda su configuración en esta aplicación',
  'Private to you and to this app. No other creation can read it.':
    'Es privado, solo para usted y esta aplicación. Ninguna otra creación puede leerlo.',
  'That is the only outside address it can reach.':
    'Es la única dirección externa a la que puede acceder.',
  'Those are the only outside addresses it can reach.':
    'Son las únicas direcciones externas a las que puede acceder.',
  "Can't reach anything outside town": 'No puede acceder a nada fuera de la ciudad',
  'Runs sandboxed on Town Square. Nothing it sees can leave.':
    'Funciona en un entorno aislado de Town Square. Nada de lo que ve puede salir.',

  // Detail page
  'What this one can touch': 'A qué puede acceder esta creación',
  'What it adds to the town': 'Lo que aporta a la ciudad',
  '{label}. Defined here, owned by nobody. Any other creation can ask to read it.':
    '{label}. Se define aquí y no es de nadie. Cualquier otra creación puede pedir permiso para leerlo.',
  required: 'obligatorio',
  'Running version {version}. Town Square keeps the source a neighbour on the committee read, and every update is read again before it replaces this one.':
    'Versión en uso: {version}. Town Square guarda el código fuente que leyó un vecino del comité, y cada actualización se vuelve a leer antes de reemplazar a esta.',

  // Running creation: chrome and failures
  'by a neighbor': 'de un vecino',
  Sandboxed: 'Aislada',
  'running on Town Square · v{version}': 'funciona en Town Square · v{version}',
  'starting {name}…': 'iniciando {name}…',
  "This one didn't start": 'Esta creación no se inició',
  'It never answered Town Square. Its builder has been told, and nothing you did caused it.':
    'Nunca le respondió a Town Square. Ya se le avisó a quien la creó, y nada de lo que usted hizo lo causó.',
  "This one didn't finish loading": 'Esta creación no terminó de cargar',
  'It connected but never finished rendering. Its builder has been told, and nothing you did caused it.':
    'Se conectó, pero nunca terminó de mostrarse. Ya se le avisó a quien la creó, y nada de lo que usted hizo lo causó.',
  'This one tried to send you somewhere else': 'Esta creación intentó llevarle a otro sitio',
  'It left Town Square instead of running here. We stopped it and flagged it for the committee. Nothing you did.':
    'Salió de Town Square en lugar de funcionar aquí. La detuvimos y la señalamos para el comité. Usted no hizo nada malo.',
  'This one stopped responding': 'Esta creación dejó de responder',
  'It stopped answering Town Square partway through. Its builder has been told.':
    'Dejó de responderle a Town Square a mitad de camino. Ya se le avisó a quien la creó.',
  'Back to the gallery': 'Volver a la galería',

  // Builder door
  'Build on Town Square': 'Cree en Town Square',
  'This town square runs on things somebody made.':
    'Esta plaza funciona gracias a cosas que alguien hizo.',
  'If you can describe an app, the AI tool you already use can build it, and Town Square can host it. A trail conditions board. A map of every camera anyone has spotted. A list of who still has a generator after an ice storm.':
    'Si puede describir una aplicación, la herramienta de IA que ya usa puede crearla, y Town Square puede alojarla. Un tablero con el estado de los senderos. Un mapa de cada cámara que alguien haya visto. Una lista de quién todavía tiene generador después de una tormenta de hielo.',
  'Connect your AI tool': 'Conecte su herramienta de IA',
  '{count} creations are live right now.': {
    one: 'Ahora mismo hay {count} creación activa.',
    other: 'Ahora mismo hay {count} creaciones activas.',
  },
  Connect: 'Conectar',
  "Mint a token below and paste one line into your tool. It then knows the SDK, the manifest format, and this town's real data.":
    'Genere un token abajo y pegue una línea en su herramienta. Así conocerá el SDK, el formato del manifiesto y los datos reales de esta ciudad.',
  'Build and preview': 'Crear y previsualizar',
  'Describe what you want. Your tool writes it, checks it against the same validator the review queue runs, and puts it on a real sandbox address you can open on your phone.':
    'Describa lo que quiere. Su herramienta lo escribe, lo comprueba con el mismo validador que usa la cola de revisión y lo pone en una dirección real en un entorno aislado que puede abrir en su teléfono.',
  'Submit for review': 'Enviar a revisión',
  'A neighbour on the committee reads your source and your permissions, then approves it or tells you what to change. It takes as long as a person reading it takes. Updates get read too.':
    'Un vecino del comité lee su código fuente y sus permisos, y luego lo aprueba o le dice qué cambiar. Tarda lo que una persona tarde en leerlo. Las actualizaciones también se leen.',
  'You will need an AI tool of your own': 'Necesitará su propia herramienta de IA',
  "Town Square does not write apps for you. There is no chat box here. You bring a tool you already have, it does the writing, and the cost of that writing is yours rather than the town's. That is why this is free to host.":
    'Town Square no escribe aplicaciones por usted. Aquí no hay un chat. Usted trae una herramienta que ya tiene, esa herramienta escribe, y el costo de esa escritura corre por su cuenta, no por la de la ciudad. Por eso el alojamiento es gratis.',
  ', in a terminal. What this is built against, and the smoothest path.':
    ', en una terminal. Es la herramienta para la que se creó todo esto y el camino más sencillo.',
  'Anything else that speaks MCP.': 'Cualquier otra herramienta compatible con MCP.',
  'Works, with a little more setup.': 'Funciona, con un poco más de configuración.',
  'A phone alone': 'Solo un teléfono',
  'is not enough yet. You need a computer you can run a command on.':
    'todavía no basta. Necesita una computadora en la que pueda ejecutar un comando.',
  'You do not need to know JavaScript. You do need to be willing to read what your tool wrote, because you are the one submitting it and your name goes on it.':
    'No necesita saber JavaScript. Lo que sí necesita es leer lo que escribió su herramienta, porque usted es quien lo envía y su nombre va en ello.',
  'A connection token is minted against your account, so this part needs you signed in. It is the same sign-in as the rest of Town Square.':
    'El token de conexión se genera con su cuenta, así que para esta parte necesita iniciar sesión. Es el mismo inicio de sesión que en el resto de Town Square.',
  'my laptop': 'mi computadora portátil',
  'New connection': 'Nueva conexión',
  'What is this for': 'Para qué es',
  'So you can tell two machines apart later. Only you see it.':
    'Para que luego pueda distinguir una computadora de otra. Solo usted lo ve.',
  'What this token can do': 'Lo que puede hacer este token',
  'Read the SDK and templates.': 'Leer el SDK y las plantillas.',
  'Docs, examples, starting shapes.': 'Documentación, ejemplos, estructuras iniciales.',
  "Read the town's public data.": 'Leer los datos públicos de la ciudad.',
  'Events, notices, businesses. The same things the website shows anyone.':
    'Eventos, avisos, negocios. Lo mismo que el sitio web le muestra a cualquiera.',
  'Create and preview drafts you own.': 'Crear y previsualizar sus propios borradores.',
  "Nobody else's drafts, ever.": 'Nunca los borradores de otra persona.',
  'Submit for review.': 'Enviar a revisión.',
  'Submit, not publish. There is no token that skips the committee.':
    'Enviar, no publicar. No existe ningún token que se salte al comité.',
  'These are fixed. They are not scopes you pick, because a builder choosing their own permissions is the thing the review queue exists to check.':
    'Estos permisos son fijos. No los elige usted, porque que quien crea algo elija sus propios permisos es justo lo que la cola de revisión existe para comprobar.',
  'Mint token': 'Generar token',
  'No connections yet. Minting one is how this starts.':
    'Todavía no hay conexiones. Todo empieza generando una.',
  'Your connections': 'Sus conexiones',
  '{active} of 10 active. A resident with ten tokens is a resident who has lost track of one.':
    '{active} de 10 activas. Quien tiene diez tokens ya perdió la pista de alguno.',
  'Copy this now': 'Cópielo ahora',
  'Town Square keeps a one-way hash of it, so we genuinely cannot recover it, not even for you. Lose it and you mint another.':
    'Town Square solo guarda un hash unidireccional del token, así que de verdad no podemos recuperarlo, ni siquiera para usted. Si lo pierde, genere otro.',
  'the token': 'el token',
  'The prefix on it is deliberate. Secret scanners know it, and so does the bundle checker, so if this ever lands in a file you publish, something catches it.':
    'El prefijo es intencional. Los detectores de secretos lo reconocen, y también el verificador de paquetes, así que si alguna vez termina en un archivo que usted publique, algo lo detectará.',
  'Paste this in your terminal': 'Pegue esto en su terminal',
  'the command': 'el comando',
  'Done, I have copied it': 'Listo, ya lo copié',
  'Copied {thing}': 'Se copió {thing}',
  'Copy {thing}': 'Copiar {thing}',
  Copied: 'Copiado',
  Copy: 'Copiar',
  Revoked: 'Revocado',
  'Revoke "{label}"?': '¿Revocar "{label}"?',
  'Whatever is using it stops working on its very next call. Your drafts and anything you have published stay exactly where they are.':
    'Lo que lo esté usando dejará de funcionar en su próxima llamada. Sus borradores y todo lo que haya publicado se quedan exactamente donde están.',
  'Keep it': 'Conservarlo',
  'Yes, revoke it': 'Sí, revocarlo',
  Revoke: 'Revocar',

  // Connection tokens: errors and last use
  'Could not reach Town Square.': 'No se pudo conectar con Town Square.',
  'Never used': 'Nunca se ha usado',
  'Used just now': 'Se usó hace un momento',
  'Used {count} minutes ago': { one: 'Se usó hace {count} minuto', other: 'Se usó hace {count} minutos' },
  'Used {count} hours ago': { one: 'Se usó hace {count} hora', other: 'Se usó hace {count} horas' },
  'Used {count} days ago': { one: 'Se usó hace {count} día', other: 'Se usó hace {count} días' },
  // Leaving dialog (outbound links from a creation)
  "You're leaving Town Square": 'Está saliendo de Town Square',
  "{name} wants to open a website in a new tab. Town Square doesn't run that site and can't vouch for it.":
    '{name} quiere abrir un sitio web en una pestaña nueva. Town Square no administra ese sitio y no puede responder por él.',
  'Stay here': 'Quedarme aquí',
  'Open site': 'Abrir sitio',
  'Going to': 'Destino',
  "This site's connection isn't private. Don't type a password or card number there.":
    'La conexión de este sitio no es privada. No escriba ahí contraseñas ni números de tarjeta.',
  'This address uses letters from another alphabet, which can make it look like a different site. Check the name carefully.':
    'Esta dirección usa letras de otro alfabeto, lo que puede hacerla parecer otro sitio. Revise bien el nombre.',
  'Make a phone call?': '¿Hacer una llamada?',
  '{name} wants to start a call. Your phone or calling app will open with this number, and nothing is dialled until you press call there.':
    '{name} quiere iniciar una llamada. Su teléfono o su aplicación de llamadas se abrirá con este número, y no se marca nada hasta que usted pulse llamar ahí.',
  Call: 'Llamar',
  Calling: 'Llamar a',
  'Write an email?': '¿Escribir un correo?',
  '{name} wants to start an email. Your email app will open with a message drafted for you to read, and nothing is sent until you press send there.':
    '{name} quiere iniciar un correo. Su aplicación de correo se abrirá con un mensaje redactado para que usted lo lea, y no se envía nada hasta que pulse enviar ahí.',
  '{name} wants to start an email. Your email app will open, and nothing is sent until you press send there.':
    '{name} quiere iniciar un correo. Su aplicación de correo se abrirá, y no se envía nada hasta que usted pulse enviar ahí.',
  'Write email': 'Escribir correo',
  To: 'Para',
  'Subject: {subject}': 'Asunto: {subject}',
}

export const review: Record<string, string> = {
  'Small ideas. More connected.':
    'Gallery headline. "Más conexión" keeps it short; "Más conectadas" (agreeing with ideas) was the alternative.',
  '{town} · made to be useful':
    'Eyebrow over the gallery. "Hecho" is masculine generic for the gallery as a whole; confirm it reads naturally after a town name.',
  'Make a day of it': 'Tool card idiom, rendered "Aproveche el día". "Haga un plan para el día" is more literal.',
  'Around the corner': 'Map tool card title, kept as the idiom "A la vuelta de la esquina".',
  'Creation starters':
    'Section heading for platform-made sample creations. "Ejemplos para empezar" is the alternative.',
  'Examples of what can be built here. These are not resident endorsements or community activity.':
    'Disclosure that samples are not resident activity. Check "recomendaciones" carries "endorsements".',
  'Each creation declares its permissions before it opens. Starter examples show the platform’s capabilities; they are not submissions from local residents.':
    'Permissions and provenance disclosure. "Envíos" for "submissions"; "propuestas" is the alternative.',
  'That shelf is empty for now.':
    'The English "shelf" metaphor for a tag filter was dropped for "sección".',
  'Posts {types} as you':
    'Card chip for writing records under the resident\'s name. {types} stays in the author\'s language.',
  'Leaves the visit':
    'Group heading for what persists after the visit. "Queda después de la visita" is a paraphrase; "Perdura" is an alternative.',
  Background: 'Group heading for low-consequence capabilities. "En segundo plano" may read as technical; "Lo habitual" is an alternative.',
  '{total} things here outlive the visit, and {hosts} of them leave town.':
    'Tally. Count words are feminine to agree with "cosas" ("una", "dos"), filled from code.',
  'That is more than most.': 'Appended to a heavy tally. "Es más de lo habitual" vs "Es más que la mayoría".',
  'You do not have to open this.': 'Counsel line on a demanding creation; tone should be calm, not alarming.',
  'Nothing on this page is an accusation. The committee approved it because it declared everything honestly, which is a different question from whether you want it.':
    'Tone-setting counsel text about committee approval.',
  "Knows you're a verified resident":
    'Masculine "verificado". Identity permission line; consider a neutral form like "Sabe que su residencia está verificada".',
  'Your handle and whether you are verified. Not your name, email or address.':
    'Privacy statement. Masculine "verificado".',
  'Asks the first time. Everything it writes is attributed to you and to this creation, and every version is kept.':
    'Write permission and data retention statement.',
  'Private to you and to this app. No other creation can read it.': 'Privacy statement for per-app storage.',
  'Version {version}. Reviewed by a neighbour on the committee before it went up, and every update is read again.':
    'Masculine generic "un vecino". "Una persona del comité" is the neutral alternative.',
  'Running version {version}. Town Square keeps the source a neighbour on the committee read, and every update is read again before it replaces this one.':
    'Masculine generic "un vecino"; same choice as the trust page footnote.',
  'by a neighbor': 'Attribution in the running creation chrome. Masculine generic "de un vecino"; "de alguien de la comunidad" is neutral but longer.',
  Sandboxed:
    'Badge on a running creation. "Aislada" agrees with creación; other areas render sandbox as "entorno aislado", which may be too long for a badge.',
  'This one tried to send you somewhere else':
    '"Llevarle" uses courtesy leísmo to avoid gendering the reader; "intentó sacarle de Town Square" is an alternative.',
  'It left Town Square instead of running here. We stopped it and flagged it for the committee. Nothing you did.':
    '"Usted no hizo nada malo" for the curt "Nothing you did."; check tone.',
  'This town square runs on things somebody made.':
    'Hero headline. The English plays on the brand name; the pun is lost in "Esta plaza funciona gracias a cosas que alguien hizo."',
  'If you can describe an app, the AI tool you already use can build it, and Town Square can host it. A trail conditions board. A map of every camera anyone has spotted. A list of who still has a generator after an ice storm.':
    'Hero copy. "Camera" is unclear in context (traffic or speed cameras?); rendered generically as "cámara".',
  'A neighbour on the committee reads your source and your permissions, then approves it or tells you what to change. It takes as long as a person reading it takes. Updates get read too.':
    'Masculine generic "un vecino". Review process description.',
  "Town Square does not write apps for you. There is no chat box here. You bring a tool you already have, it does the writing, and the cost of that writing is yours rather than the town's. That is why this is free to host.":
    'Cost and responsibility statement; "corre por su cuenta" for "is yours".',
  ', in a terminal. What this is built against, and the smoothest path.':
    'Continues after the bold product name "Claude Code", so it starts with a comma.',
  'is not enough yet. You need a computer you can run a command on.':
    'Continues after the bold "Solo un teléfono", so it starts lowercase.',
  'These are fixed. They are not scopes you pick, because a builder choosing their own permissions is the thing the review queue exists to check.':
    'Permissions statement; "quien crea algo" keeps "builder" neutral.',
  'Town Square keeps a one-way hash of it, so we genuinely cannot recover it, not even for you. Lose it and you mint another.':
    'Follows a server-written English warning. "Hash unidireccional" left technical.',
  'Mint token': '"Mint" rendered "Generar" throughout the builder door; "Crear" is the alternative.',
  'Keep it':
    'Clashes with identity.ts ("Mantener el aval", for vouching) and is also used in contribute for keeping a draft. "Conservarlo" fits all three (aval, borrador, token are masculine).',
  'my laptop': 'Default token label sent to the server when the field is left blank; it later shows in the token list.',
  "{name} wants to open a website in a new tab. Town Square doesn't run that site and can't vouch for it.":
    'Safety warning before leaving the shell; "responder por él" for "vouch for it".',
  "This site's connection isn't private. Don't type a password or card number there.":
    'Security warning for http: links; confirm tone.',
}
