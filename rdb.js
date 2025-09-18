const staticUrl = 'https://www.gstatic.com/firebasejs/12.2.1/'
const dbJS = `${staticUrl}firebase-database.js`
let db
export async function init(databaseURL, isLog) {
    const a = await import(`${staticUrl}firebase-app.js`)
    const app = a.initializeApp({ databaseURL })
    const d = await import(dbJS)
    if (isLog) console.log('firebase-database', d)
    db = d.getDatabase(app)
}

export async function get(path) {
    const { get, ref } = await import(dbJS)
    const s = await get(ref(db, path))
    if (s.exists()) return s.val()
}