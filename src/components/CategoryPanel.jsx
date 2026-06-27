import { useState } from 'react'
import styles from './CategoryPanel.module.css'

const PRESETS = ['cs.LG', 'cs.CV', 'cs.CL', 'cs.AI', 'cs.RO', 'cs.NE', 'stat.ML']

export default function CategoryPanel({ categories, selected, onSelect, onAdd, onRemove }) {
  const [input, setInput] = useState('')

  function handleAdd() {
    const val = input.trim()
    if (!val) return
    onAdd(val)
    setInput('')
  }

  return (
    <aside className={styles.panel}>
      <h2 className={styles.heading}>Topics · Search</h2>
      <ul className={styles.list}>
        {categories.map(cat => (
          <li
            key={cat.id}
            className={`${styles.item} ${selected === cat.id ? styles.active : ''}`}
          >
            <button className={styles.itemBtn} onClick={() => onSelect(cat.id)}>
              {cat.id}
            </button>
            <button className={styles.removeBtn} onClick={() => onRemove(cat.id)} title="삭제">
              ×
            </button>
          </li>
        ))}
      </ul>

      <div className={styles.addRow}>
        <input
          className={styles.input}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
          placeholder=""
          list="presets"
        />
        <datalist id="presets">
          {PRESETS.map(p => <option key={p} value={p} />)}
        </datalist>
        <button className={styles.addBtn} onClick={handleAdd}>+</button>
      </div>
    </aside>
  )
}
