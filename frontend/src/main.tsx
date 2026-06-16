import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import './styles.css'
import { usuarioLogado } from './api'
import { HOST } from './host'
import Login from './paginas/Login'
import Layout from './paginas/Layout'
import Dashboard from './paginas/Dashboard'
import Vendas from './paginas/Vendas'
import Estoque from './paginas/Estoque'
import Transferencias from './paginas/Transferencias'
import Clientes from './paginas/Clientes'
import Campanhas from './paginas/Campanhas'
import CaixaEntrada from './paginas/CaixaEntrada'
import Radar from './paginas/Radar'
import Ranking from './paginas/Ranking'
import Mural from './paginas/Mural'
import Provador from './paginas/Provador'
import Atacado from './paginas/Atacado'
import Produtos from './paginas/Produtos'
import Equipe from './paginas/Equipe'
import Estoquistas from './paginas/Estoquistas'
import Planos from './paginas/Planos'
import Colecoes from './paginas/Colecoes'
import Marca from './paginas/Marca'
import Pipeline from './paginas/Pipeline'
import Manual from './paginas/Manual'
import Landing from './paginas/site/Landing'
import Checkout from './paginas/site/Checkout'
import Sucesso from './paginas/site/Sucesso'
import Entrar from './paginas/site/Entrar'
import Catalogo from './paginas/site/Catalogo'

function Protegida({ children }: { children: React.ReactElement }) {
  return usuarioLogado() ? children : <Navigate to="/login" replace />
}

// Site público (www.zaieze.com / zaieze.com): landing comercial + checkout
function SiteApp() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/checkout" element={<Checkout />} />
      <Route path="/sucesso" element={<Sucesso />} />
      <Route path="/entrar" element={<Entrar />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

// App do tenant (<slug>.zaieze.com): CRM com login isolado por subdomínio
function CrmApp() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Protegida><Layout /></Protegida>}>
        <Route index element={<Dashboard />} />
        <Route path="vendas" element={<Vendas />} />
        <Route path="estoque" element={<Estoque />} />
        <Route path="transferencias" element={<Transferencias />} />
        <Route path="clientes" element={<Clientes />} />
        <Route path="campanhas" element={<Campanhas />} />
        <Route path="caixa" element={<CaixaEntrada />} />
        <Route path="radar" element={<Radar />} />
        <Route path="ranking" element={<Ranking />} />
        <Route path="mural" element={<Mural />} />
        <Route path="provador" element={<Provador />} />
        <Route path="atacado" element={<Atacado />} />
        <Route path="produtos" element={<Produtos />} />
        <Route path="colecoes" element={<Colecoes />} />
        <Route path="equipe" element={<Equipe />} />
        <Route path="estoquistas" element={<Estoquistas />} />
        <Route path="marca" element={<Marca />} />
        <Route path="funil" element={<Pipeline />} />
        <Route path="manual" element={<Manual />} />
        <Route path="planos" element={<Planos />} />
      </Route>
      {/* Catálogo público da vendedora: <marca>.zaieze.com/<vendedora> (sem login) */}
      <Route path="/:vendSlug" element={<Catalogo />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>{HOST.tipo === 'landing' ? <SiteApp /> : <CrmApp />}</BrowserRouter>
  </React.StrictMode>,
)
