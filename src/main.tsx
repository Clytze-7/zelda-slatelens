import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { SheikahBackground } from 'zelda-hyrule-ui'
import 'zelda-hyrule-ui/dist/index.css'
import './index.css'
import App from './App.tsx'
import { colors } from './theme'

const rootElement = document.getElementById('root')!
// CSS 和 Konva 使用同一份主题色定义。
for (const [name, value] of Object.entries(colors)) {
  rootElement.style.setProperty(`--color-${name}`, value)
}

createRoot(rootElement).render(
  <StrictMode>
    <SheikahBackground color="darkBlue" className="app-background">
      <App />
    </SheikahBackground>
  </StrictMode>,
)
