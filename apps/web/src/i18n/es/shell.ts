/**
 * The frame every screen shares: the app bar, the tabs, the loading and
 * failure states, and words many screens use.
 *
 * Register: `usted`, natural Latin American Spanish as read across the US.
 * A civic service speaks to every age in town, and `usted` is never wrong
 * there; `tú` would be friendlier and is a choice a native speaker may make.
 */

import type { Entry } from '../index.js'

export const strings: Record<string, Entry> = {
  // App bar and tabs
  'Skip to main content': 'Saltar al contenido principal',
  'Search {place}': 'Buscar en {place}',
  'Search the town': 'Buscar en la ciudad',
  'Review queue': 'Cola de revisión',
  '{handle}, verified, your account': '{handle}, verificado, su cuenta',
  '{handle}, your account': '{handle}, su cuenta',
  'Sign in': 'Iniciar sesión',
  'Verified resident': 'Residente verificado',
  'Not verified yet': 'Aún sin verificar',
  Sections: 'Secciones',
  Today: 'Hoy',
  Directory: 'Directorio',
  Creations: 'Creaciones',
  Yours: 'Lo mío',
  Nearby: 'Cerca',
  Language: 'Idioma',
  map: 'mapa',
  Account: 'Cuenta',
  '{name}, a resident-built creation': '{name}, una creación hecha por un residente',

  // App states
  'Today could not be loaded.': 'No se pudo cargar Hoy.',
  'Try again': 'Intentar de nuevo',
  'Loading today…': 'Cargando Hoy…',

  // The builder page
  'Back to creations': 'Volver a creaciones',
  'What would make town better?': '¿Qué mejoraría su ciudad?',
  'A guide to your favorite trail. A way to find a local table. A little tool that helps a neighbor.':
    'Una guía de su sendero favorito. Una forma de encontrar dónde comer en la ciudad. Una pequeña herramienta que ayuda a un vecino.',
  'The starter example shows how a small app can use the public directory while keeping resident information private.':
    'El ejemplo inicial muestra cómo una pequeña aplicación puede usar el directorio público sin exponer la información de los residentes.',
  'Publishing new creations is not open in this preview yet. You can contribute now by helping correct a place listing.':
    'Todavía no se pueden publicar creaciones nuevas en esta versión preliminar. Por ahora puede contribuir ayudando a corregir la información de un lugar.',
  'Suggest a correction': 'Sugerir una corrección',
}

export const review: Record<string, string> = {
  Yours:
    'Tab for what the resident saved and built. "Lo mío" is short and fits the tab; "Mis cosas" or "Guardado" are alternatives.',
  'Search the town':
    '"Town" is rendered "la ciudad" throughout. "Pueblo" reads as a village and would be wrong for Fort Smith; confirm "ciudad" sounds natural for Russellville too.',
  'Verified resident':
    'Masculine default. Consider "Residente con verificación" or another gender-neutral form.',
  '{handle}, verified, your account': 'Masculine "verificado"; same question as "Verified resident".',
  'What would make town better?': 'Tone-setting headline for the builder page.',
  'A guide to your favorite trail. A way to find a local table. A little tool that helps a neighbor.':
    '"Find a local table" means finding a local place to eat; rendered as "dónde comer en la ciudad".',
}
