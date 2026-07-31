# Protocolo de diagnóstico — bugs críticos

Este arquivo documenta como diagnosticar as duas classes de bug mais caras que já apareceram em
produção: conexão do WhatsApp pessoal (Baileys) e bugs de interface que só reproduzem em condições
específicas ("funciona no celular mas não no PC", etc.). Objetivo: da próxima vez, ir direto na causa
em vez de reconstruir a investigação do zero.

## 1. WhatsApp pessoal (Baileys) não conecta

O QR Code do WhatsApp pessoal (`Meu WhatsApp` em Campanhas) já quebrou de 3 jeitos diferentes,
todos com o mesmo sintoma superficial ("não conecta") mas causas totalmente diferentes. **Antes de
mexer em qualquer coisa, colete os logs — eles sempre apontam a causa exata.**

### Passo 1 — Sempre comece pelos logs

```bash
ssh -i ~/.ssh/zaieze_server ubuntu@52.44.211.84
cd ~/zaieze
docker compose -f docker-compose.prod.yml logs api --since=10m | grep -i baileys
```

Procure a sequência de eventos da tentativa de conexão (`connected to WA` → `not logged in,
attempting registration...` → o que vem depois). O que vem depois é o que diferencia os 3 bugs
conhecidos:

| Sintoma nos logs | Causa | Onde corrigir |
|---|---|---|
| `Error: Connection Failure` logo após "attempting registration" | Versão do protocolo WhatsApp Web embutida no pacote `baileys` desatualizada — a Meta rejeita | `baileys.service.ts` → `fetchLatestBaileysVersion()` (já corrigido, mas pode voltar a acontecer se o pacote `baileys` ficar muito tempo sem update) |
| QR aparece, câmera lê, celular pede "escaneie novamente" em loop | QR **rotaciona sozinho a cada ~20-60s** e a tela não estava atualizando a imagem exibida — câmera lê um QR já vencido do lado do servidor | `qrsAtuais` (Map em memória) + `GET /whatsapp/pessoal/status` retornando `qrCode` atualizado a cada poll (já corrigido) |
| `pairing configured successfully` seguido de `stream:error code 515` / `Stream Errored (restart required)`, e depois nada — celular mostra "Não foi possível conectar" | `515` (`DisconnectReason.restartRequired`) é a Meta fechando a conexão **de propósito** logo após o pareamento, pedindo reinício — é normal do protocolo, não é falha. Se o código não reconectar automaticamente nesse caso específico, o pareamento nunca termina | `baileys.service.ts`, handler de `connection === 'close'` — precisa reconectar sempre que `status === DisconnectReason.restartRequired`, não só quando `state.creds.registered` já é `true` |

### Passo 2 — Se for um sintoma novo (não está na tabela acima)

1. Pegue o `trace`/`fullErrorNode` do log — é o dado mais valioso, geralmente já diz a causa exata
   (nome do erro do Baileys, código de status).
2. Verifique se é **problema de dados** vs. **problema de código**: os contadores de
   `redistribuicoes`/`prazoEm` em leads têm histórico de rodar solto (ver seção 3) — não é WhatsApp,
   mas pode se manifestar em telas próximas do funil/carteira.
3. Peça pro usuário testar de novo com o **Console do navegador aberto** (F12 → Console) — muitos
   bugs de frontend (não só WhatsApp) já foram resolvidos rápido assim (ver seção 2).
4. Depois de corrigir, **sempre confirme via logs de novo** que a sequência completa aconteceu:
   `connected to WA` → `attempting registration` → (`pairing configured successfully` se houve
   scan) → `opened connection to WA`. Se parar em qualquer ponto antes do último, ainda não está
   resolvido, mesmo que a tela pareça ok.

### Regra geral pra mexer nesse arquivo

`baileys.service.ts` já teve bug introduzido por uma correção anterior (o fix do "loop de retry"
quebrou o caso normal de `restartRequired`). **Toda vez que mexer no handler de `connection ===
'close'`, teste os dois cenários**: (a) parear um número novo do zero (QR nunca escaneado antes) e
(b) reconectar um número já pareado (kill do container, sobe de novo, `restaurarConexoes()`).

## 2. Bugs de interface que só reproduzem às vezes ("funciona no celular, não no PC")

Aconteceu no Funil de Vendas: o card não saía da coluna "Entrou" arrastando no desktop, mas
funcionava em qualquer outra coluna e no celular. Levou várias tentativas erradas (trocar sensor de
mouse, trocar algoritmo de colisão) até a causa real aparecer — só apareceu **depois de olhar o
Console do navegador**, não adivinhando pelo código.

### O que NÃO funcionou (fica de lição)

- Trocar a biblioteca/mecanismo (`PointerSensor` → `MouseSensor`, `rectIntersection` →
  `closestCenter`) sem ter um erro concreto pra guiar a troca. Duas tentativas, sintoma idêntico —
  sinal de que o problema não estava ali.
- Ler o código e formar teoria sem validar com dado real. Várias teorias plausíveis (zoom do
  navegador, DPI, dado corrompido) foram descartadas só quando testadas.

### O que funcionou

1. **Pedir pro usuário abrir o Console (F12) e reproduzir o bug** — o log mostrou `over: null`,
   `collisions: null`, `activeRect: {initial: null, translated: null}` mesmo com o mouse claramente
   tendo se movido bastante (`delta.x` grande). Isso eliminou de vez a teoria "não moveu o
   suficiente" e apontou pra "o elemento arrastado nunca foi medido".
2. **Reler o componente procurando ONDE MAIS o mesmo dado/ID é usado** — achou-se que a lista mobile
   (escondida por CSS, mas continua **montada** no DOM) registrava um `useDraggable` com o **mesmo
   id** do card do Kanban desktop, porque a aba mobile padrão é justamente a etapa com problema
   ("Entrou"). Dois hooks competindo pelo mesmo registro na biblioteca de arrastar — um deles nunca
   mede um retângulo válido, e vence a corrida às vezes.
3. **Corrigir a causa, não o sintoma** — a correção certa foi dar um ID diferente pra instância
   escondida (`disabled` sozinho não bastava, só evita o clique, não evita o registro duplicado).

### Protocolo pra bugs "só nessa condição específica"

1. Peça o **print do Console (F12)** reproduzindo o bug — não adivinhe primeiro.
2. Pergunte explicitamente: "isso também acontece em [outra condição parecida]?" — isolar variáveis
   (coluna vs. navegador, card específico vs. todos, etc.) é mais rápido que ler o código inteiro.
3. Quando algo só acontece numa condição BEM específica (ex.: só a aba/etapa que é o **valor padrão**
   de algum estado), suspeite de **duplicação de instância/ID** — componentes escondidos por CSS
   (`display:none`) continuam montados e reativos a menos que sejam desmontados de verdade.
4. Se depois de 2 tentativas de correção o sintoma continuar **idêntico** (não muda nada, nem um
   pouco), pare de tentar variações da mesma hipótese — o problema está em outro lugar.
5. Implemente um caminho alternativo (ex.: botão "Mover etapa" sem depender de drag-and-drop) como
   rede de segurança **enquanto** investiga — não deixa o usuário travado esperando a causa raiz.

## 3. Redistribuição automática de leads rodando solta

`redistribuirAtrasados()` (cron a cada 60s, `server.ts`) redistribuiu alguns leads de teste **mais
de 1600 vezes** antes de alguém notar — eles nunca são "atendidos" (dados de demo), então o SLA de
30min estoura pra sempre e o job fica trocando de vendedora indefinidamente.

**Mitigado:** `TETO_REDISTRIBUICOES_AUTO = 5` em `leads.service.ts` — o job automático para de
redistribuir depois de 5 tentativas (o lead fica "atrasado" esperando ação manual). Redistribuição
manual (gestor/gerente clicando) não tem esse teto.

**Sinal de alerta pra monitorar no futuro:** qualquer card no Funil com `redistribuicoes` na casa das
centenas/milhares é dado de teste preso em loop — **não é um bug ativo se `redistribuidoEm` for
antigo** (confirme com a query abaixo antes de investigar de novo):

```sql
SELECT id, redistribuicoes, "redistribuidoEm" FROM leads
WHERE "redistribuidoEm" > now() - interval '15 minutes' AND redistribuicoes >= 5;
-- deve retornar 0 linhas; se retornar algo, o teto quebrou
```
