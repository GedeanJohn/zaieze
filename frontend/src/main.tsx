import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import './styles.css'
import { usuarioLogado } from './api'
import { HOST } from './host'
import { ToastProvider } from './componentes/Toast'
import { IdiomaProvider } from './lib/i18n'
import Login from './paginas/Login'
import Layout from './paginas/Layout'
import Dashboard from './paginas/Dashboard'
import Vendas from './paginas/Vendas'
import Estoque from './paginas/Estoque'
import Separacao from './paginas/Separacao'
import Clientes from './paginas/Clientes'
import Campanhas from './paginas/Campanhas'
import CaixaEntrada from './paginas/CaixaEntrada'
import Supervisao from './paginas/Supervisao'
import Radar from './paginas/Radar'
import Ranking from './paginas/Ranking'
import Mural from './paginas/Mural'
import Atacado from './paginas/Atacado'
import Produtos from './paginas/Produtos'
import Equipe from './paginas/Equipe'
import Planos from './paginas/Planos'
import Colecoes from './paginas/Colecoes'
import Marca from './paginas/Marca'
import Pipeline from './paginas/Pipeline'
import Manual from './paginas/Manual'
import Contrato from './paginas/Contrato'
import Admin from './paginas/Admin'
import WhatsAppOficial from './paginas/WhatsApp'
import InstagramOficial from './paginas/Instagram'
import PainelAfiliado from './paginas/afiliado/PainelAfiliado'
import Conta from './paginas/Conta'
import Convite from './paginas/Convite'
import Pedido from './paginas/Pedido'
import Orcamentos from './paginas/Orcamentos'
import OrcamentoPublico from './paginas/OrcamentoPublico'
import Landing from './paginas/site/Landing'
import Checkout from './paginas/site/Checkout'
import Sucesso from './paginas/site/Sucesso'
import Entrar from './paginas/site/Entrar'
import Catalogo from './paginas/site/Catalogo'
import QuemSomos from './paginas/site/QuemSomos'
import Lgpd from './paginas/site/Lgpd'
import PoliticaPrivacidade from './paginas/site/PoliticaPrivacidade'

function Protegida({ children }: { children: React.ReactElement }) {
  return usuarioLogado() ? children : <Navigate to="/login" replace />
}

// AFILIADO não pertence a nenhuma Rede/Loja — tem um painel próprio, sem o shell/menu do CRM.
function Raiz() {
  return usuarioLogado()?.role === 'AFILIADO' ? <PainelAfiliado /> : <Layout />
}

// Site público (www.zaieze.com / zaieze.com): landing comercial + checkout
function SiteApp() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/checkout" element={<Checkout />} />
      <Route path="/sucesso" element={<Sucesso />} />
      <Route path="/entrar" element={<Entrar />} />
      <Route path="/quem-somos" element={<QuemSomos />} />
      <Route path="/lgpd" element={<Lgpd />} />
      <Route path="/privacidade" element={<PoliticaPrivacidade />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

// App do tenant (<slug>.zaieze.com): CRM com login isolado por subdomínio
function CrmApp() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/convite/:token" element={<Convite />} />
      <Route path="/pedido/:id" element={<Protegida><Pedido /></Protegida>} />
      {/* Comprovante público do pedido (sem login): link enviado ao cliente */}
      <Route path="/pedido/publico/:token" element={<Pedido />} />
      {/* Orçamento público (sem login): o cliente aprova ou pede alterações por este link */}
      <Route path="/orcamento/publico/:token" element={<OrcamentoPublico />} />
      <Route path="/" element={<Protegida><Raiz /></Protegida>}>
        <Route index element={<Dashboard />} />
        <Route path="vendas" element={<Vendas />} />
        <Route path="orcamentos" element={<Orcamentos />} />
        <Route path="estoque" element={<Estoque />} />
        <Route path="separacao" element={<Separacao />} />
        <Route path="clientes" element={<Clientes />} />
        <Route path="campanhas" element={<Campanhas />} />
        <Route path="caixa" element={<CaixaEntrada />} />
        <Route path="supervisao" element={<Supervisao />} />
        <Route path="radar" element={<Radar />} />
        <Route path="ranking" element={<Ranking />} />
        <Route path="mural" element={<Mural />} />
        <Route path="atacado" element={<Atacado />} />
        <Route path="produtos" element={<Produtos />} />
        <Route path="colecoes" element={<Colecoes />} />
        <Route path="equipe" element={<Equipe />} />
        <Route path="marca" element={<Marca />} />
        <Route path="funil" element={<Pipeline />} />
        <Route path="manual" element={<Manual />} />
        <Route path="planos" element={<Planos />} />
        <Route path="contrato" element={<Contrato />} />
        <Route path="admin" element={<Admin />} />
        <Route path="whatsapp-config" element={<WhatsAppOficial />} />
        <Route path="instagram-config" element={<InstagramOficial />} />
        <Route path="conta" element={<Conta />} />
      </Route>
      {/* Catálogo público da vendedora: <marca>.zaieze.com/<vendedora> (sem login) */}
      <Route path="/:vendSlug" element={<Catalogo />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <IdiomaProvider>
      <ToastProvider>
        <BrowserRouter>{HOST.tipo === 'landing' ? <SiteApp /> : <CrmApp />}</BrowserRouter>
      </ToastProvider>
    </IdiomaProvider>
  </React.StrictMode>,
)
