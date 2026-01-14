import { useState } from 'react'

interface Popup {
  id: number
  x: number
  y: number
}

function App() {
  const [popups, setPopups] = useState<Popup[]>([])

  const handleClick = () => {
    const x = Math.random() * (window.innerWidth - 100)
    const y = Math.random() * (window.innerHeight - 50)
    setPopups([...popups, { id: Date.now(), x, y }])
  }

  return (
    <div style={{ 
      height: '100vh', 
      width: '100vw', 
      display: 'flex', 
      justifyContent: 'center', 
      alignItems: 'center', 
      position: 'relative',
      overflow: 'hidden'
    }}>
      <button onClick={handleClick} style={{ padding: '10px 20px', fontSize: '16px', cursor: 'pointer' }}>
        Click me!
      </button>
      
      {popups.map(popup => (
        <div key={popup.id} style={{
          position: 'absolute',
          left: popup.x,
          top: popup.y,
          pointerEvents: 'none'
        }}>
          Hello World
        </div>
      ))}
    </div>
  )
}

export default App

