import React, { useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import './styles.css'
import { api, usuarioLogado } from './api'
import { HOST } from './host'
import { ToastProvider } from './componentes/Toast'
import { IdiomaProvider } from './lib/i18n'
import Login from './paginas/Login'
import Layout from './paginas/Layout'
import Dashboard from './paginas/Dashboard'
import Vendas from './paginas/Vendas'
import Estoque from './paginas/Estoque'
import EstoqueInteligente from './paginas/EstoqueInteligente'
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
import PainelAssessora from './paginas/assessora/PainelAssessora'
import VitrineAssessora from './paginas/assessora/VitrineAssessora'
import Conta from './paginas/Conta'
import Convite from './paginas/Convite'
import Pedido from './paginas/Pedido'
import Orcamentos from './paginas/Orcamentos'
import OrcamentoPublico from './paginas/OrcamentoPublico'
import Provador from './paginas/Provador'
import VendedoraZaieze from './paginas/VendedoraZaieze'
import RecebimentoVendas from './paginas/RecebimentoVendas'
import LookProvador from './paginas/LookProvador'
import Landing from './paginas/site/Landing'
import Checkout from './paginas/site/Checkout'
import Sucesso from './paginas/site/Sucesso'
import Entrar from './paginas/site/Entrar'
import Catalogo from './paginas/site/Catalogo'
import QuemSomos from './paginas/site/QuemSomos'
import AssessorDeModa from './paginas/site/AssessorDeModa'
import CadastroAssessor from './paginas/site/CadastroAssessor'
import Lgpd from './paginas/site/Lgpd'
import PoliticaPrivacidade from './paginas/site/PoliticaPrivacidade'
import { aplicarImpersonacaoDaUrl } from './lib/impersonar'
import BannerImpersonar from './componentes/BannerImpersonar'
import { useProtegerConteudo } from './lib/protegerConteudo'

function Protegida({ children }: { children: React.ReactElement }) {
  return usuarioLogado() ? children : <Navigate to="/login" replace />
}

// AFILIADO e ASSESSORA não pertencem a nenhuma Rede/Loja — têm painel próprio, sem o shell/menu do CRM.
function Raiz() {
  const role = usuarioLogado()?.role
  if (role === 'AFILIADO') return <PainelAfiliado />
  if (role === 'ASSESSORA') return <PainelAssessora />
  return <Layout />
}

// Raiz "/" de um subdomínio sem sessão: se o slug pertence a uma assessora, mostra a vitrine
// pública dela (sem login); senão, cai no comportamento de sempre (login do tenant/rede).
function RaizOuVitrine() {
  const [status, setStatus] = useState<'checando' | 'assessora' | 'nenhum'>('checando')
  useEffect(() => {
    if (!HOST.slug) { setStatus('nenhum'); return }
    api.get(`/assessores/publico/${HOST.slug}`)
      .then(() => setStatus('assessora'))
      .catch(() => setStatus('nenhum'))
  }, [])
  if (status === 'checando') return null
  if (status === 'assessora') return <VitrineAssessora slug={HOST.slug!} />
  return <Navigate to="/login" replace />
}

// Elemento da rota "/": logado entra no painel (Layout/PainelAfiliado/PainelAssessora); deslogado
// só verifica a vitrine pública da assessora na raiz exata — em qualquer outro caminho, vai
// direto para o login (sem chamada extra), igual ao comportamento de sempre.
// ?vitrine=1 força a vitrine pública mesmo logada — usado pelo botão "Ver vitrine" do painel dela,
// que abre o mesmo subdomínio numa aba nova (mesma sessão) e cairia de volta no painel sem isso.
function RaizProtegida() {
  const location = useLocation()
  if (new URLSearchParams(location.search).get('vitrine') === '1') return <RaizOuVitrine />
  if (usuarioLogado()) return <Raiz />
  if (location.pathname === '/') return <RaizOuVitrine />
  return <Navigate to="/login" replace />
}

// Site público (www.zaieze.com / zaieze.com): landing comercial + checkout
function SiteApp() {
  useProtegerConteudo()
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/checkout" element={<Checkout />} />
      <Route path="/sucesso" element={<Sucesso />} />
      <Route path="/entrar" element={<Entrar />} />
      <Route path="/quem-somos" element={<QuemSomos />} />
      <Route path="/assessor-de-moda" element={<AssessorDeModa />} />
      <Route path="/assessor-de-moda/cadastro" element={<CadastroAssessor />} />
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
      {/* Provador virtual (sem login): a vendedora manda esse link, o cliente consente e envia a selfie */}
      <Route path="/look/:token" element={<LookProvador />} />
      <Route path="/" element={<RaizProtegida />}>
        <Route index element={<Dashboard />} />
        <Route path="vendas" element={<Vendas />} />
        <Route path="orcamentos" element={<Orcamentos />} />
        <Route path="estoque" element={<Estoque />} />
        <Route path="estoque-inteligente" element={<EstoqueInteligente />} />
        <Route path="separacao" element={<Separacao />} />
        <Route path="clientes" element={<Clientes />} />
        <Route path="campanhas" element={<Campanhas />} />
        <Route path="caixa" element={<CaixaEntrada />} />
        <Route path="supervisao" element={<Supervisao />} />
        <Route path="radar" element={<Radar />} />
        <Route path="ranking" element={<Ranking />} />
        <Route path="mural" element={<Mural />} />
        <Route path="atacado" element={<Atacado />} />
        <Route path="provador" element={<Provador />} />
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
        <Route path="vendedora-zaieze" element={<VendedoraZaieze />} />
        <Route path="recebimento-vendas" element={<RecebimentoVendas />} />
        <Route path="conta" element={<Conta />} />
      </Route>
      {/* Catálogo público da vendedora: <marca>.zaieze.com/<vendedora> (sem login) */}
      <Route path="/:vendSlug" element={<Catalogo />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

// Aplica um pacote de "entrar como" vindo na URL (ver lib/impersonar.ts) ANTES de qualquer coisa
// renderizar — troca o localStorage síncrono, então usuarioLogado() já vem certo no 1º render.
aplicarImpersonacaoDaUrl()

// Registra o service worker (sem cache — só existe pra habilitar o prompt de instalação do PWA).
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}) })
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <IdiomaProvider>
      <ToastProvider>
        <BannerImpersonar />
        <BrowserRouter>{HOST.tipo === 'landing' ? <SiteApp /> : <CrmApp />}</BrowserRouter>
      </ToastProvider>
    </IdiomaProvider>
  </React.StrictMode>,
)
