import '../index.css'
import './print.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { applyStoredTheme } from '@/lib/theme'
import { App } from './app'

applyStoredTheme()

const root = document.getElementById('root')
if (!root) throw new Error('The admin page has no #root element.')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
