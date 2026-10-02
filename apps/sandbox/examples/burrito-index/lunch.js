import { town, app } from '@townsquare/sdk'
const list = document.getElementById('list')
const status = document.getElementById('status')
const search = document.getElementById('search')
let places = []
function render() {
  const query = search.value.trim().toLowerCase()
  const shown = places.filter(place => `${place.name} ${place.category}`.toLowerCase().includes(query))
  list.replaceChildren()
  status.textContent = `${shown.length} ${shown.length === 1 ? 'place' : 'places'}${query ? ' matching your search' : ' to explore'}`
  for (const place of shown) {
    const row = document.createElement('li')
    const heading = document.createElement('h2'); heading.textContent = place.name
    const category = document.createElement('p'); category.textContent = place.category
    const address = document.createElement('p'); address.textContent = place.address || 'Address not listed'
    row.append(heading, category, address)
    if (place.phone) { const phone = document.createElement('p'); phone.textContent = `Phone: ${place.phone}`; row.append(phone) }
    list.append(row)
  }
}
search.addEventListener('input', render)
try {
  const result = await town.businesses({ tag: 'restaurant', limit: 200 })
  places = result.items.sort((a,b) => a.name.localeCompare(b.name))
  render()
  app.setTitle('Lunch around town')
} catch { status.textContent = 'The directory could not be loaded. Close this example and try again.' }
finally { app.ready() }
