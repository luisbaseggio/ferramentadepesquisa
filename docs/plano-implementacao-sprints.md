# Plano Técnico Por Sprint

## Objetivo

Levar a plataforma atual do modo local para um MVP multiusuário utilizável por clientes reais, sem perder o fluxo central:

`Ao Vivo -> Radar -> Revisão -> Aprovados`

---

## Premissas

- duração sugerida de sprint: `1 semana`
- equipe mínima ideal:
  - `1 dev full-stack`
  - `1 apoio de produto/design`
- prioridade:
  - primeiro `segurança e isolamento de dados`
  - depois `jobs e integrações`
  - depois `conforto operacional`

---

## Sprint 0

### Meta

Preparar o terreno sem quebrar o produto atual.

### Entregáveis

- decisão final da stack
- definição do ambiente de deploy
- definição do banco
- definição do auth
- mapa de migração dos JSONs locais

### Tarefas

1. Congelar a stack do MVP:
   - `Next.js`
   - `Prisma`
   - `Postgres`
   - `Redis + BullMQ`
   - `Clerk` ou `Supabase Auth`

2. Criar ambientes:
   - `local`
   - `staging`
   - `production`

3. Definir provedores:
   - frontend/api
   - banco
   - redis
   - storage

4. Mapear os estados atuais que saem de JSON:
   - `review-queue.json`
   - `approved-channel.json`
   - `approved-posts`

### Critério de aceite

- stack e provedores decididos
- documento de arquitetura fechado
- backlog técnico priorizado

---

## Sprint 1

### Meta

Criar a base multiusuário.

### Entregáveis

- autenticação
- usuário
- workspace
- membership
- seleção de workspace

### Tarefas

1. Subir `Postgres`
2. Configurar `Prisma`
3. Criar schema inicial:
   - `users`
   - `workspaces`
   - `workspace_members`
4. Integrar auth provider
5. Criar fluxo:
   - login
   - logout
   - criação de workspace
   - convite simples
6. Adicionar contexto de `workspace ativo`

### Critério de aceite

- usuário consegue logar
- usuário consegue criar workspace
- usuário vê só seu workspace

### Risco principal

- auth mal acoplada com o backend desde o começo

---

## Sprint 2

### Meta

Mover o núcleo de dados do produto para o banco.

### Entregáveis

- sinais ao vivo no banco
- drafts no banco
- revisão no banco
- approved no banco

### Tarefas

1. Criar tabelas:
   - `source_profiles`
   - `live_signals`
   - `drafts`
   - `review_decisions`
   - `approved_packets`

2. Criar camada de acesso a dados
3. Migrar leitura/escrita que hoje usa JSON
4. Garantir `workspace_id` em tudo
5. Manter o produto atual rodando por feature flag ou fallback

### Critério de aceite

- review queue não depende mais de arquivo local
- approved channel não depende mais de arquivo local
- dados são isolados por workspace

### Risco principal

- misturar regras antigas em memória com banco novo

---

## Sprint 3

### Meta

Colocar o frontend multiusuário para conversar com o banco.

### Entregáveis

- home multiworkspace
- radar por workspace
- live por workspace
- revisão interna por workspace

### Tarefas

1. Adaptar páginas:
   - `Home`
   - `Ao Vivo`
   - `Radar`
   - `Approved`
2. Adicionar `workspace switcher`
3. Trocar chamadas que hoje leem arquivos por chamadas ao banco
4. Adicionar filtros reais:
   - nicho
   - formato
   - status
   - fonte

### Critério de aceite

- usuário autenticado consegue operar dentro do próprio workspace
- revisão interna funciona sem Sheets
- formatos continuam visíveis em toda a jornada

### Risco principal

- UI antiga presumir estado único global

---

## Sprint 4

### Meta

Separar processamento pesado da interface.

### Entregáveis

- worker
- fila de jobs
- jobs de coleta
- jobs de geração

### Tarefas

1. Subir `Redis`
2. Configurar `BullMQ`
3. Criar worker dedicado
4. Criar jobs:
   - coleta de notícias
   - atualização do ao vivo
   - geração de drafts
   - geração de approved packet
5. Adicionar tabela `job_runs`
6. Mostrar status básico dos jobs na UI

### Critério de aceite

- coleta não bloqueia request web
- geração de drafts não trava UI
- jobs têm status e log mínimo

### Risco principal

- deixar lógica de negócio duplicada entre web e worker

---

## Sprint 5

### Meta

Tornar integrações externas multiusuário.

### Entregáveis

- Google Sheets por workspace
- config segura de integrações
- sync opcional

### Tarefas

1. Criar tabela `integration_connections`
2. Criptografar config sensível
3. Criar UI de integrações
4. Mover Sheets para integração por workspace
5. Permitir:
   - conectar
   - desconectar
   - testar
   - sincronizar

### Critério de aceite

- cada workspace pode ter sua própria planilha
- plataforma funciona mesmo sem Sheets
- credenciais não ficam expostas no disco

### Risco principal

- tentar usar uma única credencial global para todos os clientes

---

## Sprint 6

### Meta

Fechar operação, segurança e exportação.

### Entregáveis

- audit log
- exportações
- storage real
- limites de uso

### Tarefas

1. Criar tabela `audit_events`
2. Registrar eventos:
   - aprovação
   - rejeição
   - criação de draft
   - edição de approved
   - reset
3. Mover markdown/export para storage
4. Salvar URL de arquivo no banco
5. Adicionar rate limit
6. Adicionar limites por workspace

### Critério de aceite

- existe trilha de auditoria
- arquivos não dependem de disco local
- sistema tem proteção mínima para abuso

### Risco principal

- deixar exportações em filesystem local do container

---

## Sprint 7

### Meta

Lançamento controlado com usuários reais.

### Entregáveis

- staging validado
- onboarding mínimo
- monitoramento de erros

### Tarefas

1. Criar ambiente de staging
2. Convidar primeiros usuários
3. Adicionar monitoramento:
   - logs
   - erros
   - latência
4. Criar onboarding:
   - criar workspace
   - escolher nicho
   - conectar Sheets opcional
   - gerar primeiro draft

### Critério de aceite

- 3 a 5 usuários conseguem usar
- nenhum dado cruza entre workspaces
- fluxo principal funciona de ponta a ponta

---

## Ordem Exata De Build

Se quiser fazer sem desperdiçar esforço:

1. `Sprint 0`
2. `Sprint 1`
3. `Sprint 2`
4. `Sprint 3`
5. `Sprint 4`
6. `Sprint 5`
7. `Sprint 6`
8. `Sprint 7`

---

## O Que Não Fazer No MVP

Evite colocar já:

- billing complexo
- times com permissões super detalhadas
- múltiplos providers de auth ao mesmo tempo
- analytics avançado
- marketplace de integrações
- versionamento editorial sofisticado

Tudo isso pode entrar depois.

No MVP, o foco é:

- multiusuário seguro
- operação estável
- fluxo editorial funcionando

---

## Checkpoint De Go/No-Go

Antes de abrir para usuários reais, confirme:

1. login está funcionando
2. workspaces isolam dados corretamente
3. revisão interna funciona sem Sheets
4. geração de drafts funciona em background
5. approved salva edição manual e prompt
6. integração externa é opcional
7. erros são rastreados
8. exports não dependem de disco local

---

## Próximo Passo Recomendado

O próximo passo técnico real deve ser:

`Sprint 1: users + workspaces + auth + Postgres`

Sem isso, qualquer passo de multiusuário ainda fica apoiado em uma base local demais.
