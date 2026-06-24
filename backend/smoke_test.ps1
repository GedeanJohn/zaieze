$ErrorActionPreference = 'Stop'
$base = 'http://localhost:3050'
function Login($email, $senha) {
  $r = Invoke-RestMethod "$base/api/auth/login" -Method Post -ContentType 'application/json' -Body (@{ email=$email; senha=$senha } | ConvertTo-Json)
  return $r
}
function Hdr($token) { return @{ Authorization = "Bearer $token" } }
$pass = 0; $fail = 0
function Check($name, $cond, $detail) {
  if ($cond) { Write-Host "  [PASS] $name -> $detail" -ForegroundColor Green; $script:pass++ }
  else { Write-Host "  [FAIL] $name -> $detail" -ForegroundColor Red; $script:fail++ }
}

Write-Host "`n=== 1. Health ===" -ForegroundColor Cyan
$h = Invoke-RestMethod "$base/health"
Check "health" ($h.status -eq 'ok') "$($h.servico) v$($h.versao)"

Write-Host "`n=== 2. Login Maria (GERENTE) + dashboard da loja ===" -ForegroundColor Cyan
$maria = Login 'maria@lojademo.com.br' 'demo123'
Check "login maria" ($maria.usuario.role -eq 'GERENTE') "loja=$($maria.usuario.loja.nome)"
$dash = Invoke-RestMethod "$base/api/dashboard" -Headers (Hdr $maria.token)
Check "dashboard papel LOJA" ($dash.papel -eq 'LOJA') "fatMes=R$ $($dash.faturamentoMes) | vendedoras=$($dash.porVendedora.Count) | topProdutos=$($dash.topProdutos.Count) | estoqueCritico=$($dash.estoqueCritico.Count)"
$formasTxt = ($dash.porFormaRecebimento | ForEach-Object { "$($_.forma)=$($_.total)" }) -join ' '
Check "formas no dashboard" ($dash.porFormaRecebimento.Count -gt 0) $formasTxt

Write-Host "`n=== 3. Venda com baixa de estoque ===" -ForegroundColor Cyan
$prods = Invoke-RestMethod "$base/api/produtos" -Headers (Hdr $maria.token)
$var = ($prods | ForEach-Object { $_.variacoes } | Sort-Object estoque -Descending | Select-Object -First 1)
$prodDe = ($prods | Where-Object { $_.variacoes.id -contains $var.id }).nome
$cli = (Invoke-RestMethod "$base/api/clientes" -Headers (Hdr $maria.token))[0]
$vend = (Invoke-RestMethod "$base/api/usuarios" -Headers (Hdr $maria.token) | Where-Object { $_.role -eq 'VENDEDORA' })[0]
$estoqueAntes = $var.estoque
$body = @{ clienteId=$cli.id; vendedoraId=$vend.id; atacado=$false; formaRecebimento='CREDITO'; desconto=0; itens=@(@{ variacaoId=$var.id; quantidade=1 }) } | ConvertTo-Json
$venda = Invoke-RestMethod "$base/api/vendas" -Method Post -ContentType 'application/json' -Headers (Hdr $maria.token) -Body $body
$prods2 = Invoke-RestMethod "$base/api/produtos" -Headers (Hdr $maria.token)
$estoqueDepois = ($prods2 | ForEach-Object { $_.variacoes } | Where-Object { $_.id -eq $var.id }).estoque
Check "venda criada" ($null -ne $venda.id) "total=R$ $($venda.total) vendedora=$($vend.nome) cliente=$($cli.nome)"
Check "forma de recebimento gravada" ($venda.formaRecebimento -eq 'CREDITO') "forma=$($venda.formaRecebimento)"
Check "baixa de estoque" ($estoqueDepois -eq ($estoqueAntes - 1)) "$prodDe $($var.cor)/$($var.tamanho): $estoqueAntes -> $estoqueDepois"

Write-Host "`n=== 4. Cancelar venda devolve estoque ===" -ForegroundColor Cyan
Invoke-RestMethod "$base/api/vendas/$($venda.id)/cancelar" -Method Post -ContentType 'application/json' -Body '{}' -Headers (Hdr $maria.token) | Out-Null
$prods3 = Invoke-RestMethod "$base/api/produtos" -Headers (Hdr $maria.token)
$estoqueCancel = ($prods3 | ForEach-Object { $_.variacoes } | Where-Object { $_.id -eq $var.id }).estoque
Check "devolucao de estoque" ($estoqueCancel -eq $estoqueAntes) "estoque voltou para $estoqueCancel"

Write-Host "`n=== 5. Segmentacao automatica ===" -ForegroundColor Cyan
$seg = Invoke-RestMethod "$base/api/clientes/segmentar" -Method Post -ContentType 'application/json' -Body '{}' -Headers (Hdr $maria.token)
$d = $seg.distribuicao
Check "segmentar loja" ($seg -ne $null) "VIP=$($d.VIP) Frequente=$($d.FREQUENTE) Inativo=$($d.INATIVO) Atacado=$($d.ATACADO) Novo=$($d.NOVO) | reclassificados=$($seg.atualizados)"
$resumo = Invoke-RestMethod "$base/api/clientes/resumo/segmentos" -Headers (Hdr $maria.token)
Check "resumo segmentos" ($resumo.total -gt 0) "total carteira=$($resumo.total)"

Write-Host "`n=== 6. Isolamento de carteira (Camila VENDEDORA) ===" -ForegroundColor Cyan
$camila = Login 'camila@lojademo.com.br' 'demo123'
$cliMaria = (Invoke-RestMethod "$base/api/clientes" -Headers (Hdr $maria.token)).Count
$cliCamila = (Invoke-RestMethod "$base/api/clientes" -Headers (Hdr $camila.token))
$soDaCamila = ($cliCamila | Where-Object { $_.vendedora.id -ne $camila.usuario.id }).Count
Check "vendedora ve menos que gerente" ($cliCamila.Count -lt $cliMaria) "camila=$($cliCamila.Count) vs loja=$cliMaria"
Check "carteira isolada" ($soDaCamila -eq 0) "0 clientes fora da carteira da Camila"
$dashC = Invoke-RestMethod "$base/api/dashboard" -Headers (Hdr $camila.token)
Check "dashboard VENDEDORA" ($dashC.papel -eq 'VENDEDORA') "mes=R$ $($dashC.mes.total) meta=$($dashC.meta) pctMeta=$($dashC.pctMeta)%"

Write-Host "`n=== 7b. Produto: referencia + SKU derivado (estoque central, gestor) ===" -ForegroundColor Cyan
$gestor = Login 'gestor@lunabrand.com.br' 'gestor123'
$ref = "REF-" + ([guid]::NewGuid().ToString('N').Substring(0,6).ToUpper())
$prodBody = @{ referencia=$ref; nome='Camiseta Teste'; genero='UNISSEX'; categoria='Camiseta'; precoVarejo=59.9; composicao='100% algodao'; variacoes=@(@{ cor='Azul'; tamanho='U'; estoque=5; estoqueMinimo=2 }) } | ConvertTo-Json -Depth 6
$novoProd = Invoke-RestMethod "$base/api/produtos" -Method Post -ContentType 'application/json' -Headers (Hdr $gestor.token) -Body $prodBody
Check "produto criado com referencia (rede)" ($novoProd.referencia -eq $ref) "ref=$($novoProd.referencia) genero=$($novoProd.genero)"
$skuGerado = $novoProd.variacoes[0].sku
Check "SKU derivado da referencia (preserva hifen)" ($skuGerado -like "$ref-AZUL-U*") "sku=$skuGerado"

Write-Host "`n=== 7. Consolidado da rede (Gestor ELITE) ===" -ForegroundColor Cyan
$dashG = Invoke-RestMethod "$base/api/dashboard" -Headers (Hdr $gestor.token)
Check "dashboard GESTOR" ($dashG.papel -eq 'GESTOR') "rede=$($dashG.rede.nome) lojas=$($dashG.porLoja.Count) fatMesRede=R$ $($dashG.consolidado.faturamentoMes)"

Write-Host "`n=== 8. Gestor de estoque: entrada de producao (estoque central) ===" -ForegroundColor Cyan
$estoq = Login 'estoquista@lunabrand.com.br' 'estoque123'
Check "login gestor de estoque" ($estoq.usuario.role -eq 'ESTOQUISTA') "rede=$($estoq.usuario.rede.nome)"
$prodsE = Invoke-RestMethod "$base/api/produtos" -Headers (Hdr $estoq.token)
$varE = ($prodsE | ForEach-Object { $_.variacoes } | Select-Object -First 1)
$antesE = $varE.estoque
$entradaBody = @{ nota='NF-TESTE'; itens=@(@{ variacaoId=$varE.id; quantidade=7 }) } | ConvertTo-Json -Depth 6
$resE = Invoke-RestMethod "$base/api/estoque/entrada" -Method Post -ContentType 'application/json' -Headers (Hdr $estoq.token) -Body $entradaBody
$prodsE2 = Invoke-RestMethod "$base/api/produtos" -Headers (Hdr $estoq.token)
$depoisE = ($prodsE2 | ForEach-Object { $_.variacoes } | Where-Object { $_.id -eq $varE.id }).estoque
Check "entrada incrementa estoque central" ($depoisE -eq ($antesE + 7)) "$antesE -> $depoisE (+$($resE.totalPecas) pecas)"
$mov = (Invoke-RestMethod "$base/api/estoque/movimentos?tipo=ENTRADA" -Headers (Hdr $estoq.token))[0]
Check "movimento ENTRADA registrado" (($mov.tipo -eq 'ENTRADA') -and ($mov.quantidade -eq 7)) "qtd=$($mov.quantidade) motivo=$($mov.motivo)"

Write-Host "`n=== 9. Distribuicao de colecao para lojas (toggles) ===" -ForegroundColor Cyan
$lojasAll = Invoke-RestMethod "$base/api/lojas" -Headers (Hdr $estoq.token)
$colsAll = Invoke-RestMethod "$base/api/colecoes" -Headers (Hdr $estoq.token)
$colDist = $colsAll | Select-Object -First 1
$lojaIds = @($lojasAll | ForEach-Object { $_.id })
$distBody = @{ lojaIds=$lojaIds } | ConvertTo-Json -Depth 6
$resDist = Invoke-RestMethod "$base/api/colecoes/$($colDist.id)/distribuicao" -Method Put -ContentType 'application/json' -Headers (Hdr $estoq.token) -Body $distBody
Check "colecao distribuida para as lojas" (@($resDist.lojaIds).Count -eq $lojaIds.Count) "colecao=$($colDist.nome) lojas=$(@($resDist.lojaIds).Count)"

Write-Host "`n=== 10. Gestor gerencia gestor de estoque ===" -ForegroundColor Cyan
$novoEmail = "est-" + ([guid]::NewGuid().ToString('N').Substring(0,6)) + "@lunabrand.com.br"
$estBody = @{ nome='Estoquista Teste'; email=$novoEmail; senha='estoque123'; telefone='5562900000000' } | ConvertTo-Json
$novoEst = Invoke-RestMethod "$base/api/estoquistas" -Method Post -ContentType 'application/json' -Headers (Hdr $gestor.token) -Body $estBody
Check "estoquista criado pelo gestor" ($novoEst.ativo -eq $true) "email=$($novoEst.email)"
$listaEst = Invoke-RestMethod "$base/api/estoquistas" -Headers (Hdr $gestor.token)
Check "aparece na lista da rede" ((@($listaEst | Where-Object { $_.id -eq $novoEst.id })).Count -eq 1) "total=$(@($listaEst).Count)"
$loginNovo = Login $novoEmail 'estoque123'
Check "novo estoquista consegue logar" ($loginNovo.usuario.role -eq 'ESTOQUISTA') "role=$($loginNovo.usuario.role)"

Write-Host "`n=== 11. Dashboard do estoque central ===" -ForegroundColor Cyan
$dashRede = Invoke-RestMethod "$base/api/estoque/dashboard" -Headers (Hdr $estoq.token)
Check "dashboard estoque central" (($dashRede.papel -eq 'REDE') -and ($dashRede.valorCusto -gt 0)) "rede=$($dashRede.rede.nome) skus=$($dashRede.skus) valorCusto=R$ $($dashRede.valorCusto) criticos=$($dashRede.criticosCount) parados=$($dashRede.paradosCount)"

Write-Host "`n=== 12. WhatsApp: sugestao IA, campanha (LGPD), regua, webhook ===" -ForegroundColor Cyan
$sug = Invoke-RestMethod "$base/api/campanhas/sugerir" -Method Post -ContentType 'application/json' -Headers (Hdr $maria.token) -Body (@{ segmento='INATIVO' } | ConvertTo-Json)
Check "sugestao de mensagem" ($sug.texto.Length -gt 0) "viaIa=$($sug.viaIa)"
$campBody = @{ nome='Smoke Novidades'; mensagemTemplate='Oi {primeiroNome}, novidades na {loja}! - {vendedora}' } | ConvertTo-Json
$camp = Invoke-RestMethod "$base/api/campanhas" -Method Post -ContentType 'application/json' -Headers (Hdr $maria.token) -Body $campBody
Check "campanha respeita LGPD" (($camp.alcance -ge 1) -and ($camp.semConsentimento -ge 1)) "alcance=$($camp.alcance) simulados=$($camp.simulados) semLGPD=$($camp.semConsentimento)"
$reg = Invoke-RestMethod "$base/api/reguas/processar" -Method Post -ContentType 'application/json' -Body '{}' -Headers (Hdr $maria.token)
$alc = ($reg.reguas | Measure-Object -Property alcance -Sum).Sum
Check "regua de inatividade processada" ($alc -ge 1) "clientes alcancados=$alc"
$cliAna = (Invoke-RestMethod "$base/api/clientes" -Headers (Hdr $maria.token)) | Where-Object { $_.nome -like 'Ana Paula*' } | Select-Object -First 1
$wh = Invoke-RestMethod "$base/api/whatsapp/webhook" -Method Post -ContentType 'application/json' -Body (@{ telefone=$cliAna.telefone; texto='Oi, vi a promo!' } | ConvertTo-Json)
Check "webhook roteia entrada para a vendedora" ($wh.roteado -eq $true) "mensagemId=$($wh.mensagemId)"
$conv = Invoke-RestMethod "$base/api/whatsapp/conversas/$($cliAna.id)" -Headers (Hdr $maria.token)
Check "conversa registra mensagem recebida" ((@($conv | Where-Object { $_.direcao -eq 'RECEBIDA' })).Count -ge 1) "total msgs=$(@($conv).Count)"

Write-Host "`n=== 13. Estoque Inteligente + Radar de Oportunidades ===" -ForegroundColor Cyan
$intel = Invoke-RestMethod "$base/api/estoque/inteligencia" -Headers (Hdr $estoq.token)
Check "estoque inteligente (campeoes)" (@($intel.campeoes).Count -ge 1) "campeoes=$(@($intel.campeoes).Count) ruptura=$(@($intel.ruptura).Count)"
$radar = Invoke-RestMethod "$base/api/radar" -Headers (Hdr $maria.token)
Check "radar gera oportunidade" (@($radar.oportunidades).Count -ge 1) "oportunidades=$(@($radar.oportunidades).Count)"
$op = $radar.oportunidades[0]
Check "oportunidade com clientes alvo" ($op.clientesAlvo -ge 1) "produto=$($op.produto) categoria=$($op.categoria) alvo=$($op.clientesAlvo) valorParado=R$ $($op.valorParado)"
$rdBody = @{ nome="Radar - $($op.produto)"; clienteIds=$op.clienteIds; mensagemTemplate='Oi {primeiroNome}, novidade na {loja}! - {vendedora}' } | ConvertTo-Json -Depth 6
$rd = Invoke-RestMethod "$base/api/campanhas" -Method Post -ContentType 'application/json' -Headers (Hdr $maria.token) -Body $rdBody
Check "disparo do radar em 1 clique" ($rd.alcance -ge 1) "alcance=$($rd.alcance) simulados=$($rd.simulados)"

Write-Host "`n=== 14. Ranking + Comissao + Mural ===" -ForegroundColor Cyan
$rank = Invoke-RestMethod "$base/api/ranking" -Headers (Hdr $maria.token)
Check "ranking ordenado por faturamento" (($rank[0].posicao -eq 1) -and (@($rank).Count -ge 2)) "1o $($rank[0].nome) R$ $($rank[0].total)"
$com = Invoke-RestMethod "$base/api/comissoes" -Headers (Hdr $maria.token)
$topCom = ($com | Sort-Object comissao -Descending)[0]
Check "comissao calculada (regra encadeada)" ($topCom.comissao -gt 0) "$($topCom.nome) comissao=R$ $([math]::Round($topCom.comissao,2)) metaBatida=$($topCom.atingiuMeta)"
$cat = (Invoke-RestMethod "$base/api/produtos/taxonomias/listar" -Headers (Hdr $maria.token)).categorias[0]
$regraBody = @{ escopo='CATEGORIA'; refId=$cat.id; percentual=8; percentualMeta=10 } | ConvertTo-Json
$reg = Invoke-RestMethod "$base/api/comissoes/regras" -Method Post -ContentType 'application/json' -Headers (Hdr $maria.token) -Body $regraBody
Check "regra de comissao salva (upsert)" ($null -ne $reg.percentual) "escopo=$($reg.escopo) pct=$($reg.percentual)"
$mural = Invoke-RestMethod "$base/api/mural" -Headers (Hdr $maria.token)
Check "mural lista novidades" (@($mural).Count -ge 1) "posts=$(@($mural).Count)"
$post = Invoke-RestMethod "$base/api/mural" -Method Post -ContentType 'application/json' -Headers (Hdr $maria.token) -Body (@{ titulo='Aviso smoke'; conteudo='teste de mural' } | ConvertTo-Json)
Check "publicar no mural" ($post.titulo -eq 'Aviso smoke') "autor=$($post.autor.nome)"

Write-Host "`n=== 15. Atacado ===" -ForegroundColor Cyan
$atac = Invoke-RestMethod "$base/api/atacado" -Headers (Hdr $maria.token)
Check "atacado: clientes e giro" (($atac.resumo.clientes -ge 1) -and ($atac.resumo.faturamentoAtacado -gt 0)) "clientes=$($atac.resumo.clientes) fatAtacado=R$ $($atac.resumo.faturamentoAtacado)"

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  RESULTADO: $pass PASS / $fail FAIL" -ForegroundColor $(if ($fail -eq 0) { 'Green' } else { 'Red' })
Write-Host "========================================`n" -ForegroundColor Cyan
if ($fail -gt 0) { exit 1 }
