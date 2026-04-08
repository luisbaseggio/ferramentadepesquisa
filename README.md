# Ferramenta de Pesquisa Automatizada para Nichos

Este projeto cria uma base simples para automatizar pesquisas sobre tecnologia, politica e geopolitica usando a API oficial do Google Programmable Search Engine.

## Por que essa abordagem

Em vez de fazer scraping direto do Google, a ferramenta usa a API oficial. Isso tende a ser mais estavel, mais facil de manter e menos arriscado do ponto de vista operacional.

## O que a CLI faz

- Gera consultas por nicho
- Pesquisa varias paginas de resultado
- Deduplica links repetidos
- Salva a pesquisa em `JSON`
- Gera um relatorio em `Markdown`
- Sugere angulos iniciais para carrosseis
- Pode ativar um agente editorial que seleciona temas com mais potencial de polemica e fecha cada pauta com inovacao

## Requisitos

- Node.js 18+
- Uma chave da API do Google Custom Search JSON API
- Um `cx` de um mecanismo de busca programavel

## Configuracao

Defina estas variaveis no terminal:

```bash
export GOOGLE_CSE_API_KEY="sua-chave"
export GOOGLE_CSE_CX="seu-cx"
```

## Como rodar

```bash
node src/main.js --niche tecnologia
```

Exemplos:

```bash
node src/main.js --niche tecnologia --pages 3
node src/main.js --niche politica --domains g1.globo.com,valor.globo.com
node src/main.js --niche geopolitica --recency-days 14
node src/main.js --niche "regulacao de IA no brasil"
node src/main.js --niche tecnologia --agent-mode polemico-inovacao --brief-count 5
```

## Saida

Os arquivos sao gravados em `output/`:

- `output/<nicho>.json`
- `output/<nicho>.md`

## Parametros

- `--niche`: nicho ou tema livre
- `--pages`: numero de paginas da busca, de 1 a 10
- `--locale`: filtro de idioma, padrao `lang_pt`
- `--country`: filtro geografico, padrao `countryBR`
- `--recency-days`: janela de recencia, padrao `7`
- `--domains`: dominios priorizados, separados por virgula
- `--agent-mode`: use `polemico-inovacao` para gerar briefs editoriais
- `--brief-count`: quantidade de briefs do agente, de 1 a 20
- `--output-dir`: diretorio de saida

## Agente polemico com fechamento em inovacao

Quando voce roda:

```bash
node src/main.js --niche tecnologia --agent-mode polemico-inovacao --brief-count 5
```

o sistema faz tres camadas:

1. pesquisa resultados recentes com foco maior em termos de alta, debate, crise e inovacao
2. pontua cada item por tensao, inovacao, urgencia e impacto de mercado
3. gera briefs com:
   - gancho polemico
   - angulo de debate
   - roteiro em 5 blocos
   - fechamento amarrado em inovacao
   - alerta editorial para evitar desinformacao

Esse modo e util quando voce quer transformar noticia ou tendencia em um conteudo mais opinativo, sem perder o gancho estrategico no final.

## Estrategia para Instagram

Uma forma simples de usar a saida:

1. Rodar a pesquisa do nicho.
2. Ler o `Markdown` e selecionar de 3 a 5 pautas.
3. Transformar cada pauta em:
   - gancho
   - contexto
   - dado principal
   - implicacao pratica
   - fechamento com opiniao ou pergunta

## Proximos passos recomendados

- adicionar score de relevancia por fonte
- integrar com banco de dados
- classificar tendencia, risco e oportunidade
- calibrar o score do agente com pesos por nicho
- incluir coleta complementar de YouTube, Reddit e noticias

## Radar em tempo real para polemicas de inovacao

Agora o projeto tambem inclui um painel de radar continuo, com:

- coleta recorrente em Google Noticias
- agrupamento de polemicas por tema
- score de tensao + inovacao + recencia
- briefs editoriais prontos para fechamento em inovacao
- atualizacao ao vivo via `SSE`

Suba o servidor:

```bash
npm run radar:web
```

Depois abra:

- `http://localhost:4173/` para entrar, criar conta e escolher o workspace ativo
- `http://localhost:4173/radar` para o radar
- `http://localhost:4173/live` para o monitor ao vivo
- `http://localhost:4173/approved` para os aprovados

## Ajuste com GPT no canal de aprovados

O canal `/approved` agora pode aplicar o prompt de ajuste direto no `Render final`.

Para ativar isso, defina:

```bash
export OPENAI_API_KEY="sua-chave-openai"
```

Opcionalmente, voce tambem pode escolher o modelo:

```bash
export OPENAI_MODEL="gpt-5.4-mini"
```

Depois reinicie o servidor:

```bash
npm run radar:web
```

Na tela de aprovados, escreva o prompt em `Prompt de ajuste` e clique em `Aplicar com GPT`.

Observacoes:

- O radar foi implementado com arquitetura pronta para receber novas fontes depois, como uma rede social especifica.
- A primeira fonte ativa e o Google Noticias, para reduzir dependencia de scraping e manter o fluxo mais estavel.

## Users, workspaces e auth

O MVP agora tem uma base inicial de acesso:

- cadastro com nome, email e senha
- login por cookie de sessao
- criacao do primeiro workspace no cadastro
- troca de workspace ativo pela home
- criacao de novos workspaces sem sair da app
- protecao das areas `/live`, `/radar` e `/approved`

Nesta fase inicial, a separacao de identidade e acesso ja esta pronta. O restante da operacao editorial ainda continua na mesma base local, e a proxima fase natural e mover fila, aprovados e sinais para armazenamento por workspace.

## Como compartilhar o MVP com outras pessoas

Hoje existem dois jeitos simples de abrir acesso:

### 1. Compartilhar na mesma rede local

Com o servidor rodando:

```bash
npm run radar:web
```

em outro terminal rode:

```bash
npm run share:lan
```

Isso vai imprimir links como:

```text
http://10.10.192.55:4173/
```

Se a outra pessoa estiver na mesma rede Wi-Fi, ela pode abrir esse link e fazer login.

### 2. Compartilhar com link publico temporario

Com o servidor rodando:

```bash
npm run radar:web
```

em outro terminal rode:

```bash
npm run share:web
```

O `localtunnel` vai gerar uma URL publica temporaria. Essa e a URL que voce manda para outras pessoas.

Fluxo recomendado:

1. Subir o servidor com `npm run radar:web`
2. Abrir o link publico com `npm run share:web`
3. Mandar a URL gerada
4. A pessoa entra pela home, cria conta e escolhe o primeiro workspace

Observacao importante:

- enquanto o seu computador estiver ligado e o servidor estiver rodando, o link funciona
- se voce parar o servidor ou o tunel, o link cai
- nesta fase de MVP a base ainda roda a partir da sua maquina local

## Fila de revisao com Google Sheets

O painel agora tambem pode sincronizar a fila de revisao com uma planilha Google Sheets.

Configuracao padrao deste projeto:

- planilha: `1z3zgq0BgJcXrC7q0yVtL6AiWxJM9SrqNyGq13-AqXlg`
- aba: `review_queue`
- credencial local: `/Users/luisoliveira/Downloads/robotic-epoch-476719-h8-3e07fd8444df.json`

Voce pode sobrescrever via variaveis de ambiente:

```bash
export GOOGLE_SHEETS_SPREADSHEET_ID="sua-planilha"
export GOOGLE_SHEETS_SHEET_NAME="review_queue"
export GOOGLE_SHEETS_SERVICE_ACCOUNT_PATH="/caminho/da/credencial.json"
```

Fluxo:

1. Rodar o radar em `http://localhost:4173/radar`
2. Clicar em `Rodar agente e gerar posts`
3. Abrir o Google Sheets
4. Revisar os itens nas colunas `review_decision` e `review_notes`
5. Voltar ao painel e clicar em `Importar revisao do Sheets`
6. Os itens `pending` e `approved` sao sincronizados com o Google Sheets

Se um item virar `rejected`, ele sai da aba para manter a planilha focada apenas no que esta em analise ou aprovado.
