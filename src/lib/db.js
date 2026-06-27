import { openDB } from 'idb'

const DB_NAME = 'research-graph'
const DB_VERSION = 1

function getDB() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('papers')) {
        const store = db.createObjectStore('papers', { keyPath: 'arxivId' })
        store.createIndex('status', 'status')
      }
      if (!db.objectStoreNames.contains('categories')) {
        db.createObjectStore('categories', { keyPath: 'id' })
      }
    },
  })
}

export async function savePaper(paper) {
  const db = await getDB()
  await db.put('papers', { ...paper, arxivId: paper.id, savedAt: Date.now(), status: 'saved' })
}

export async function markRead(arxivId) {
  const db = await getDB()
  const existing = await db.get('papers', arxivId)
  if (existing) await db.put('papers', { ...existing, status: 'read' })
}

export async function toggleSota(paperId) {
  const db = await getDB()
  const existing = await db.get('papers', paperId)
  if (!existing) return
  const next = existing.status === 'sota' ? 'saved' : 'sota'
  await db.put('papers', { ...existing, status: next })
}

export async function getPapers() {
  const db = await getDB()
  return db.getAll('papers')
}

export async function getPaper(arxivId) {
  const db = await getDB()
  return db.get('papers', arxivId)
}

export async function getCategories() {
  const db = await getDB()
  return db.getAll('categories')
}

export async function addCategory(id, label) {
  const db = await getDB()
  await db.put('categories', { id, label })
}

export async function removeCategory(id) {
  const db = await getDB()
  await db.delete('categories', id)
}
