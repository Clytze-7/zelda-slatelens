import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { SheikahBackground } from 'zelda-hyrule-ui'
import 'zelda-hyrule-ui/dist/index.css'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SheikahBackground color="darkBlue" className="app-background">
      <App />
    </SheikahBackground>
  </StrictMode>,
)
