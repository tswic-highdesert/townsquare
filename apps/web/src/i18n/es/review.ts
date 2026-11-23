/**
 * Moderation and reporting: the committee's review screens and the resident's report form.
 * Status words are feminine on purpose, agreeing with "creación", "versión" and "propuesta".
 */

import type { Entry } from '../index.js'

export const strings: Record<string, Entry> = {
  // Review.tsx: tabs and frame
  Corrections: 'Correcciones',
  Submissions: 'Envíos',
  Reports: 'Reportes',
  'Live creations': 'Creaciones publicadas',
  Back: 'Volver',
  Moderation: 'Moderación',

  // Review.tsx: submission queue
  'Nothing waiting': 'Nada en espera',
  "Every submitted version is read before it runs in anyone's browser, including updates to creations that are already live.":
    'Cada versión enviada se lee antes de ejecutarse en el navegador de cualquier persona, incluidas las actualizaciones de creaciones que ya están publicadas.',
  'Waiting for review': 'En espera de revisión',
  update: 'actualización',
  'new creation': 'creación nueva',
  '{count} files': { one: '{count} archivo', other: '{count} archivos' },
  'asks for more': 'pide más',
  '{count} warnings': { one: '{count} advertencia', other: '{count} advertencias' },

  // Review.tsx: one submission
  'Live at /{slug}.': 'Publicada en /{slug}.',
  'Marked {status}.': 'Marcada como {status}.',
  Queue: 'Cola',
  'update to': 'actualización de',
  'currently on v{version}': 'actualmente en la v{version}',
  'new creation, proposed': 'creación nueva, propuesta como',
  'Flagged for a human': 'Requiere revisión humana',
  Source: 'Código fuente',
  '{bytes} bytes': '{bytes} bytes',
  'Not shown: {files}': 'No se muestra: {files}',
  Decide: 'Decisión',
  'What the builder should know': 'Lo que debe saber quien la creó',
  'Required unless you are approving.': 'Obligatorio, salvo si va a aprobar.',
  'Shown to the builder verbatim.': 'Se muestra tal cual a quien la creó.',
  'Approve and publish': 'Aprobar y publicar',
  'Request changes': 'Pedir cambios',
  Reject: 'Rechazar',
  '“No” with no reason is a dead end the builder cannot act on, so turning something down needs a note. Approving does not.':
    'Un “no” sin motivo deja a quien la creó sin saber qué hacer, así que para decir que no hace falta una nota. Para aprobar, no.',
  'Approval is of this exact version, pinned by digest': 'La aprobación vale para esta versión exacta, fijada por el hash',
  'A later update comes back here.': 'Una actualización posterior volverá a pasar por aquí.',

  // Review.tsx: reports
  'Nothing open': 'Nada pendiente',
  'A queue nobody drains is worse than no queue, so these are meant to be read and closed, including the many that are read and closed with nothing else happening.':
    'Una cola que nadie vacía es peor que no tener cola, así que estos reportes están para leerse y cerrarse, incluidos los muchos que se leen y se cierran sin que pase nada más.',
  'reported by @{handle}': 'reportado por @{handle}',
  'Close this report': 'Cerrar este reporte',
  'Acting on a creation, hiding it, blocking it, reverting it, closes the open reports against it on its own. This is for the ones where the answer is that nothing needs to happen.':
    'Actuar sobre una creación (ocultarla, bloquearla o revertirla) cierra por sí solo los reportes abiertos contra ella. Esto es para los casos en que la respuesta es que no hace falta hacer nada.',
  'What you concluded': 'Su conclusión',
  'Kept with the report. The person who filed it is told what was concluded, and often that is “we read it, nothing needed to happen”.':
    'Se guarda con el reporte. A quien lo presentó se le informa la conclusión, y a menudo es “lo leímos, no hacía falta hacer nada”.',
  'Nothing to do': 'No hay nada que hacer',
  'Fair, handled elsewhere': 'Con razón, se atendió por otra vía',
  Cancel: 'Cancelar',

  // Review.tsx: live creations
  'Nothing has been approved yet': 'Todavía no se ha aprobado nada',
  'This fills as the queue is worked through. The example creations were never submitted, so they are not here.':
    'Esto se llena a medida que se revisa la cola. Las creaciones de ejemplo nunca se enviaron, así que no aparecen aquí.',
  'Everything already running': 'Todo lo que ya está en funcionamiento',
  '{count} open reports': { one: '{count} reporte abierto', other: '{count} reportes abiertos' },
  Hidden: 'Oculta',
  Blocked: 'Bloqueada',
  'Put back': 'Restaurada',
  Reverted: 'Revertida',
  '{count} open reports closed with it.': {
    one: 'Se cerró {count} reporte abierto con esta acción.',
    other: 'Se cerraron {count} reportes abiertos con esta acción.',
  },

  // Review.tsx: status and reason words the API sends as machine values
  active: 'activa',
  hidden: 'oculta',
  blocked: 'bloqueada',
  submitted: 'enviada',
  approved: 'aprobada',
  rejected: 'rechazada',
  superseded: 'reemplazada',
  'changes requested': 'con cambios solicitados',
  illegal: 'ilegal',
  security: 'seguridad',
  impersonation: 'suplantación',
  spam: 'spam',
  broken: 'no funciona',
  other: 'otro',

  // Review.tsx: one live creation
  'Open reports': 'Reportes abiertos',
  Act: 'Acción',
  Why: 'Motivo',
  'Required, and kept in the moderation log.': 'Obligatorio. Se guarda en el registro de moderación.',
  '“Who did this, when, and what did they say” is what makes this role accountable. Required for putting something back, too.':
    '“Quién lo hizo, cuándo y qué dijo” es lo que obliga a este rol a rendir cuentas. También es obligatorio para restaurar algo.',
  Hide: 'Ocultar',
  Block: 'Bloquear',
  'Put it back': 'Restaurar',
  'Nothing here deletes anything. Hidden and blocked both stop the sandbox serving it, both get an explainer page rather than a blank frame, and both are undone by putting it back.':
    'Nada de esto borra nada. Tanto ocultar como bloquear hacen que el entorno aislado deje de servirla, las dos muestran una página explicativa en lugar de un marco en blanco y las dos se deshacen al restaurarla.',
  Versions: 'Versiones',
  live: 'publicada',
  'a revert': 'una reversión',
  replaced: 'reemplazada',
  'Put v{version} back': 'Restaurar la v{version}',
  'Reverting publishes these exact bytes again as a new version, re-checked against the digest they were approved with. The version being replaced stays in this list with its author still on it, so undoing this costs one more forward write.':
    'Revertir vuelve a publicar exactamente estos bytes como una versión nueva, verificados otra vez contra el hash con el que se aprobaron. La versión reemplazada se queda en esta lista sin perder su autoría, así que deshacer esto cuesta solo una escritura más hacia adelante.',
  'Moderation log': 'Registro de moderación',
  'by @{handle}': 'por @{handle}',
  'Append-only. An entry is never edited or removed, including one somebody regrets.':
    'Solo se agregan entradas. Ninguna se edita ni se elimina, aunque alguien se arrepienta de ella.',

  // Review.tsx: the permission diff
  identity: 'identidad',
  'reads records': 'lee registros',
  'writes records': 'escribe registros',
  network: 'red',
  'private storage': 'almacenamiento privado',
  device: 'dispositivo',
  'What changed · v{from} to v{to}': 'Qué cambió · de la v{from} a la v{to}',
  'Nothing new is being asked for. This update only changes code.':
    'No pide nada nuevo. Esta actualización solo cambia código.',
  Renamed: 'Renombrada',
  'from {from} to {to}': 'de {from} a {to}',
  Adds: 'Agrega',
  'Defines new record types:': 'Define tipos de registro nuevos:',
  'Drops {permission}:': 'Quita {permission}:',
  'What it asks for': 'Qué pide',
  'Nothing. It reads public town data, which needs no declaration, and can reach nothing else.':
    'Nada. Lee datos públicos de la ciudad, que no requieren declaración, y no puede acceder a nada más.',

  // ContributionReview.tsx
  'The correction queue could not be loaded. Please try again.':
    'No se pudo cargar la cola de correcciones. Intente de nuevo.',
  'Community corrections': 'Correcciones de la comunidad',
  'Neighbors help keep the directory useful. Check the source before changing a public listing.':
    'Los vecinos ayudan a que el directorio siga siendo útil. Revise la fuente antes de cambiar la información pública de un lugar.',
  'Loading corrections…': 'Cargando correcciones…',
  'New corrections will appear here for a person to review.':
    'Las correcciones nuevas aparecerán aquí para que una persona las revise.',
  'Corrections waiting for review': 'Correcciones en espera de revisión',
  'Community contribution': 'Contribución de la comunidad',
  Review: 'Revisar',
  'This correction could not be loaded. Go back and try again.':
    'No se pudo cargar esta corrección. Vuelva e intente de nuevo.',
  'The decision could not be saved. Please try again.': 'No se pudo guardar la decisión. Intente de nuevo.',
  'Back to corrections': 'Volver a correcciones',
  'Loading the proposal…': 'Cargando la propuesta…',
  'Correction published': 'Corrección publicada',
  'Correction declined': 'Corrección rechazada',
  'Correction withdrawn': 'Corrección retirada',
  'The decision is saved and visible to the neighbor who sent it.':
    'La decisión quedó guardada y la puede ver la persona que la envió.',
  'On the listing now': 'Lo que aparece ahora',
  'No value is listed.': 'No hay ningún valor.',
  'Proposed change': 'Cambio propuesto',
  'How the neighbor knows': 'Cómo lo sabe quien la propuso',
  'Note to the neighbor': 'Nota para quien la propuso',
  'Required when declining. Explain the decision kindly; the neighbor will read these exact words.':
    'Obligatoria al rechazar. Explique la decisión con amabilidad; quien la propuso leerá estas mismas palabras.',
  'This listing changed since the correction was submitted. Decline with an explanation so the neighbor can send an updated proposal.':
    'La información de este lugar cambió después de que se envió la corrección. Rechácela con una explicación para que quien la propuso pueda enviar una propuesta actualizada.',
  'Approval changes the public listing after its short cache refresh. Every version stays in the record.':
    'Al aprobarla, la información pública cambia tras una breve actualización de la caché. Todas las versiones quedan en el registro.',
  'Approve correction': 'Aprobar corrección',
  'Decline correction': 'Rechazar corrección',

  // reviewApi.ts and reportApi.ts: fallbacks when the API sends no message
  'Could not load that.': 'No se pudo cargar.',
  'Something went wrong.': 'Algo salió mal.',
  'The correction queue could not be loaded.': 'No se pudo cargar la cola de correcciones.',
  'The correction could not be loaded.': 'No se pudo cargar la corrección.',
  'Could not send that.': 'No se pudo enviar.',

  // reportApi.ts: report reasons
  'Illegal — this breaks the law': 'Ilegal: infringe la ley',
  'Security — it is doing something it should not be able to': 'Seguridad: hace algo que no debería poder hacer',
  'Impersonation — it pretends to be someone or something else':
    'Suplantación: se hace pasar por otra persona o por otra cosa',
  'Spam — it exists to advertise': 'Spam: existe para hacer publicidad',
  'Broken — it does not work any more': 'No funciona: dejó de funcionar',
  'Something else': 'Otra cosa',

  // ReportPanel.tsx and identity/ReportForm.tsx
  'Report {name}': 'Reportar {name}',
  'Reporting is for verified residents. Someone who is already verified can vouch for you from their account page.':
    'Solo los residentes verificados pueden reportar. Una persona que ya esté verificada puede darle su aval desde la página de su cuenta.',
  'Reporting is for verified residents, so a moderator knows a neighbour is behind it. Someone who is already verified can vouch for you from their account page.':
    'Solo los residentes verificados pueden reportar, para que el equipo de moderación sepa que detrás hay un vecino. Una persona que ya esté verificada puede darle su aval desde la página de su cuenta.',
  'Sign in to report this. Reporting is for verified residents, so a moderator knows a neighbour is behind it.':
    'Inicie sesión para reportar esto. Solo los residentes verificados pueden reportar, para que el equipo de moderación sepa que detrás hay un vecino.',
  Close: 'Cerrar',
  'Already reported': 'Ya lo había reportado',
  'You had already reported this, so we kept your first report rather than adding another.':
    'Usted ya había reportado esto, así que conservamos su primer reporte en lugar de agregar otro.',
  'Sent. A moderator will read it. Most reports are read and closed with nothing else happening, and that is normal.':
    'Enviado. Alguien del equipo de moderación lo leerá. La mayoría de los reportes se leen y se cierran sin que pase nada más, y eso es normal.',
  'Tell the committee what happened': 'Cuéntele al comité qué pasó',
  'Town Square follows the law and does not referee taste. What gets acted on is mostly the first two.':
    'Town Square cumple la ley y no arbitra gustos. Lo que suele llevar a una acción son las dos primeras opciones.',
  'What is wrong': 'Qué problema hay',
  'Anything a moderator should know': 'Algo que el equipo de moderación deba saber',
  'Optional. A sentence is plenty.': 'Opcional. Basta con una frase.',
  'Optional. What you saw, and where.': 'Opcional. Qué vio y dónde.',
  'One category, one box. More fields would make this feel like paperwork and would collect things a moderator does not need.':
    'Una categoría y un cuadro de texto. Más campos harían que esto pareciera un trámite y recogerían datos que el equipo de moderación no necesita.',
  'Sent as @{handle}.': 'Se envía como @{handle}.',
  'Sent as @{handle} with version {version}.': 'Se envía como @{handle}, con la versión {version}.',
  Send: 'Enviar',
  'Send report': 'Enviar reporte',
}

export const review: Record<string, string> = {
  // Moderation screens
  'Live creations':
    '"Live" rendered as "publicadas" (published and running). "En vivo" reads like streaming; "activas" is another option but collides with the "active" status word.',
  'Marked {status}.':
    'Feminine "Marcada", agreeing with an implied "propuesta". The {status} words (rechazada, con cambios solicitados) are feminine too. Confirm it reads naturally without the noun.',
  Hidden:
    'Action labels used both as the outcome ("Oculta.") and in the log ("Oculta por @x"). Feminine to agree with "creación". Infinitive or noun forms (Ocultación) are alternatives.',
  'Put back':
    '"Put back" (restore) rendered "Restaurada". English is deliberately plain; "Vuelta a publicar" is closer in tone but long.',
  'new creation, proposed':
    'Followed by the proposed URL slug in code. "propuesta como" = "proposed as". Context: moderator queue.',
  'What the builder should know':
    '"Builder" (person who made the creation) avoided as a gendered noun: "quien la creó". "Creador/a" is the alternative.',
  '“No” with no reason is a dead end the builder cannot act on, so turning something down needs a note. Approving does not.':
    'Policy explanation for moderators. "Dead end" paraphrased as "sin saber qué hacer". Check tone.',
  'Approval is of this exact version, pinned by digest':
    'Technical: "digest" (bundle hash) rendered "hash", which Spanish-speaking developers use. "Huella digital" or "resumen criptográfico" are alternatives.',
  'A queue nobody drains is worse than no queue, so these are meant to be read and closed, including the many that are read and closed with nothing else happening.':
    'Moderation policy tone. "Drains" rendered "vacía".',
  'Kept with the report. The person who filed it is told what was concluded, and often that is “we read it, nothing needed to happen”.':
    'Tells moderators the reporter sees the conclusion. Civic meaning; confirm "presentó" (filed) and the quoted phrase.',
  'Fair, handled elsewhere':
    'Resolution "upheld": the report was right and was dealt with by another action. "Con razón" = the reporter was right. "Procedente, atendido en otro lugar" is a more formal option.',
  'Nothing to do': 'Resolution "dismissed". Confirm it does not read as dismissive toward the reporter.',
  '“Who did this, when, and what did they say” is what makes this role accountable. Required for putting something back, too.':
    'Accountability statement. "Rendir cuentas" for "accountable". Masculine-free.',
  'Nothing here deletes anything. Hidden and blocked both stop the sandbox serving it, both get an explainer page rather than a blank frame, and both are undone by putting it back.':
    '"Sandbox" rendered "entorno aislado". Some readers may expect the English "sandbox".',
  'Reverting publishes these exact bytes again as a new version, re-checked against the digest they were approved with. The version being replaced stays in this list with its author still on it, so undoing this costs one more forward write.':
    '"With its author still on it" rendered "sin perder su autoría" to avoid masculine "autor". "Forward write" kept literal ("escritura hacia adelante"); confirm it makes sense.',
  'Append-only. An entry is never edited or removed, including one somebody regrets.':
    'Public accountability promise. "Append-only" paraphrased as "Solo se agregan entradas".',
  'Drops {permission}:': '"Drops" a permission. "Quita" follows the glossary (Remove=Quitar); "Ya no pide" is softer.',
  broken:
    'Short reason word shown to moderators. "No funciona" chosen over "rota/dañada" so it matches the resident-facing reason label.',
  impersonation: '"Suplantación" (de identidad). Confirm it is clear on its own.',

  // Correction review
  'Neighbors help keep the directory useful. Check the source before changing a public listing.':
    'Masculine generic "Los vecinos" (glossary). "Listing" rendered "la información pública de un lugar", matching shell.ts.',
  'How the neighbor knows':
    'Avoids masculine "el vecino" with "quien la propuso" (who proposed it). Same choice in the note label, help and error text.',
  'On the listing now':
    'Heading over the current value of a place listing. "Lo que aparece ahora" chosen; "En la ficha ahora" is an alternative.',

  // Reporting (resident-facing)
  'Reporting is for verified residents. Someone who is already verified can vouch for you from their account page.':
    'Verification and vouching rules. Masculine generic "residentes verificados". "Darle su aval" avoids a gendered "avalarlo/avalarla".',
  'Sign in to report this. Reporting is for verified residents, so a moderator knows a neighbour is behind it.':
    '"A moderator" rendered "el equipo de moderación" (neutral). "Un vecino" is masculine generic; "una persona de la comunidad" is the neutral option.',
  'Sent. A moderator will read it. Most reports are read and closed with nothing else happening, and that is normal.':
    'Deliberately promises no outcome. Confirm the Spanish does not imply more or less than English. "Enviado" agrees with an implied "reporte".',
  'You had already reported this, so we kept your first report rather than adding another.':
    'Duplicate-report message; must not read as thanks or as a new report being counted.',
  'Town Square follows the law and does not referee taste. What gets acted on is mostly the first two.':
    'Policy statement. "No arbitra gustos" for "does not referee taste". "The first two" refers to the first two reasons (illegal, security).',
  'Sent as @{handle}.':
    'Tells the resident the report is not anonymous. Present tense "Se envía" because it sits beside the Send button before sending.',
  'Illegal — this breaks the law':
    'Report reasons: English uses an em dash; Spanish uses a colon. "Infringe la ley" could also be "viola la ley".',
  'Security — it is doing something it should not be able to':
    'Report reason with security meaning; confirm "hace algo que no debería poder hacer" is clear.',
  'Impersonation — it pretends to be someone or something else': 'Report reason with legal meaning.',
  'Tell the committee what happened': '"Committee" (the moderation committee) rendered "comité".',
}
