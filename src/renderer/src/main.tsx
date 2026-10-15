import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {/* MUI 的 ThemeProvider 在 App 内部：它需要 disguiseTheme 状态才能
        为每套伪装主题生成对应配色。 */}
    <App />
  </React.StrictMode>
)
