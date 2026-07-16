import { useEffect, useState } from 'react'
import { api, mensagemDeErro } from '../api'
import { useToast } from '../componentes/Toast'

interface Config {
  chavePixTipo: string | null
  chavePix: string | null
  linkPagamentoCartao: string | null
}

const TIPOS_CHAVE_PIX = ['EMAIL', 'CPF', 'TELEFONE', 'ALEATORIA'] as const

/**
 * Dados bancários que a loja usa pra receber diretamente do cliente (PIX ou link de cobrança
 * externo por cartão) — pagamento sempre FORA do sistema, ZAIEZE não processa. Hoje usado pela
 * Vendedora ZAIEZE pra informar o cliente ao fechar o pedido; boleto não é suportado por enquanto.
 */
export default function RecebimentoVendas() {
  const avisar = useToast()
  const [chavePixTipo, setChavePixTipo] = useState('')
  const [chavePix, setChavePix] = useState('')
  const [linkPagamentoCartao, setLinkPagamentoCartao] = useState('')
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => {
    api.get('/recebimento')
      .then(({ data }: { data: Config }) => {
        setChavePixTipo(data.chavePixTipo ?? '')
        setChavePix(data.chavePix ?? '')
        setLinkPagamentoCartao(data.linkPagamentoCartao ?? '')
      })
      .catch((e) => setErro(mensagemDeErro(e)))
      .finally(() => setCarregando(false))
  }, [])

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    setSalvando(true); setErro('')
    try {
      await api.put('/recebimento', {
        chavePixTipo: chavePixTipo || null,
        chavePix: chavePix.trim() || null,
        linkPagamentoCartao: linkPagamentoCartao.trim() || null,
      })
      avisar('Dados de recebimento salvos.')
    } catch (err) { setErro(mensagemDeErro(err)) } finally { setSalvando(false) }
  }

  if (carregando) return null

  return (
    <>
      <header><h1>Recebimento das Vendas</h1></header>
      <p style={{ color: 'var(--ink-soft)', marginTop: -4 }}>
        Como a loja recebe diretamente do cliente — o pagamento continua fora do sistema (ZAIEZE não
        processa cartão nem PIX). Isso é usado pela Vendedora ZAIEZE pra informar o cliente na hora de
        fechar o pedido. Boleto não é suportado por enquanto.
      </p>

      {erro && <div className="alerta">{erro}</div>}

      <form onSubmit={salvar} className="cartao" style={{ maxWidth: 520 }}>
        <h2 style={{ marginTop: 0 }}>PIX</h2>
        <div className="campo">
          <label>Tipo de chave</label>
          <select value={chavePixTipo} onChange={(e) => setChavePixTipo(e.target.value)}>
            <option value="">— não usar PIX —</option>
            {TIPOS_CHAVE_PIX.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="campo">
          <label>Chave PIX</label>
          <input value={chavePix} onChange={(e) => setChavePix(e.target.value)} placeholder="ex.: financeiro@suamarca.com.br" />
        </div>

        <h2>Cartão de crédito</h2>
        <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: -8 }}>
          Link de cobrança de um gateway próprio (Mercado Pago, PagSeguro, InfinitePay, Stone etc.) — a
          Vendedora ZAIEZE só envia esse link pro cliente, não processa o cartão.
        </p>
        <div className="campo">
          <label>Link de pagamento</label>
          <input type="url" value={linkPagamentoCartao} onChange={(e) => setLinkPagamentoCartao(e.target.value)} placeholder="https://…" />
        </div>

        <div className="acoes">
          <button className="btn" disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar'}</button>
        </div>
      </form>
    </>
  )
}
