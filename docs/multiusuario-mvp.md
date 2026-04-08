# Estrutura Multiusuario Para O MVP

## Objetivo

Transformar a plataforma atual, que hoje funciona como um estúdio local de pesquisa e roteirização, em um MVP multiusuário para outras pessoas usarem com segurança, isolamento de dados e fluxo compartilhado.

O objetivo do MVP não é escalar infinitamente no primeiro dia.
O objetivo é:

- permitir login
- separar dados por usuário e por workspace
- manter o fluxo `Ao Vivo -> Radar -> Revisão -> Aprovados`
- suportar geração de roteiros em múltiplos formatos
- permitir revisão interna sem depender do Google Sheets
- manter Google Sheets como integração opcional

---

## Decisão Principal

### Arquitetura recomendada para o MVP

Use esta composição:

1. `Frontend web`
2. `API backend`
3. `Worker de jobs`
4. `Postgres`
5. `Redis`
6. `Storage de arquivos`
7. `Autenticação`

### Stack recomendada

- Frontend: `Next.js`
- API: `Next.js Route Handlers` ou `Fastify`
- Banco: `Postgres`
- ORM: `Prisma`
- Fila: `Redis + BullMQ`
- Auth: `Clerk` ou `Supabase Auth`
- Storage: `S3`, `Cloudflare R2` ou `Supabase Storage`
- Deploy:
  - frontend/api: `Railway`, `Render`, `Fly.io` ou `Vercel + backend separado`
  - Postgres: `Neon`, `Supabase` ou `Railway Postgres`
  - Redis: `Upstash Redis` ou `Railway Redis`

### Minha recomendação mais prática

Para MVP rápido:

- `Next.js`
- `Prisma`
- `Postgres (Neon ou Supabase)`
- `Redis (Upstash)`
- `Clerk` para auth
- `S3/R2` para arquivos

Isso te dá velocidade sem te prender em infra pesada.

---

## O Que Precisa Mudar Em Relação Ao Que Existe Hoje

Hoje o projeto está local-first e salva muito estado em JSON:

- `output/review-queue.json`
- `output/approved-channel.json`
- `output/approved-posts/`

Isso precisa sair do centro da arquitetura.

No MVP multiusuário:

- JSON local vira apenas cache temporário, ou desaparece
- estado principal vai para `Postgres`
- geração assíncrona vai para `workers`
- arquivos gerados vão para `storage`
- cada dado pertence a um `workspace`

---

## Modelo De Produto

### Entidades principais

Você precisa destas entidades:

1. `User`
2. `Workspace`
3. `WorkspaceMember`
4. `SourceProfile`
5. `LiveSignal`
6. `Draft`
7. `ReviewDecision`
8. `ApprovedPacket`
9. `PromptBox`
10. `IntegrationConnection`
11. `JobRun`
12. `AuditEvent`

### Relação central

- um `User` pode participar de vários `Workspaces`
- um `Workspace` pode ter vários usuários
- todo conteúdo pertence a um `Workspace`
- cada `Draft` nasce de uma notícia/sinal
- cada `Draft` pode ter revisão
- `ApprovedPacket` é a versão editorial lapidada do `Draft`

---

## Modelo De Banco

### Tabelas mínimas

#### `users`

- `id`
- `auth_provider`
- `auth_provider_user_id`
- `name`
- `email`
- `avatar_url`
- `created_at`
- `updated_at`

#### `workspaces`

- `id`
- `name`
- `slug`
- `owner_user_id`
- `plan`
- `created_at`
- `updated_at`

#### `workspace_members`

- `id`
- `workspace_id`
- `user_id`
- `role`
- `created_at`

Papéis do MVP:

- `owner`
- `editor`
- `reviewer`

#### `source_profiles`

Guarda configurações de coleta.

- `id`
- `workspace_id`
- `name`
- `niche`
- `site_filters_json`
- `recency_hours`
- `is_default`
- `created_at`
- `updated_at`

#### `live_signals`

Notícias coletadas.

- `id`
- `workspace_id`
- `source_profile_id`
- `title`
- `source_name`
- `source_link`
- `published_at`
- `snippet`
- `query`
- `heat`
- `score_total`
- `signals_json`
- `raw_payload_json`
- `created_at`

#### `drafts`

Roteiros criados a partir de notícias/sinais.

- `id`
- `workspace_id`
- `live_signal_id`
- `format`
- `format_label`
- `niche`
- `title`
- `hook`
- `angle`
- `innovation_close`
- `caption`
- `slides_json`
- `blocks_json`
- `thread_posts_json`
- `scenes_json`
- `cta`
- `status`
- `source_title`
- `source_link`
- `source_name`
- `query`
- `score_total`
- `created_by_user_id`
- `created_at`
- `updated_at`

#### `review_decisions`

- `id`
- `workspace_id`
- `draft_id`
- `decision`
- `notes`
- `decided_by_user_id`
- `created_at`
- `updated_at`

#### `approved_packets`

- `id`
- `workspace_id`
- `draft_id`
- `selected_headline_number`
- `selected_template`
- `generated_final_render`
- `manual_final_render`
- `ai_prompt`
- `evaluation_status`
- `evaluation_score`
- `evaluation_notes`
- `markdown_url`
- `created_at`
- `updated_at`

#### `integration_connections`

- `id`
- `workspace_id`
- `type`
- `status`
- `config_encrypted_json`
- `created_at`
- `updated_at`

Tipos:

- `google_sheets`
- `notion`
- `airtable`
- `webhook`

#### `job_runs`

- `id`
- `workspace_id`
- `job_type`
- `status`
- `input_json`
- `output_json`
- `error_message`
- `started_at`
- `finished_at`

#### `audit_events`

- `id`
- `workspace_id`
- `user_id`
- `event_type`
- `target_type`
- `target_id`
- `payload_json`
- `created_at`

---

## Fluxos Principais

### Fluxo 1: Observação

`Ao Vivo`

- usuário abre o painel
- backend lê sinais recentes do banco
- worker atualiza sinais em background
- usuário observa sem criar nada

### Fluxo 2: Criação

`Ao Vivo -> criar roteiro`

- usuário clica em uma notícia ou hotspot
- escolhe formato
- API cria `draft`
- draft entra em revisão

### Fluxo 3: Radar editorial

`Radar -> gerar posts`

- backend consulta perfil do workspace
- worker busca notícias
- motor editorial gera briefs
- drafts são criados
- drafts aparecem na fila

### Fluxo 4: Revisão

`Revisão interna`

- usuário aprova ou rejeita
- decisão fica no banco
- integração com Sheets pode sincronizar depois, se estiver habilitada

### Fluxo 5: Finalização

`Approved`

- packet é gerado do draft aprovado
- usuário escolhe headline/template
- usuário edita render final
- usuário salva prompt base
- resultado vira peça pronta para exportação

---

## Módulos Que Você Deve Ter

### 1. Autenticação

Você precisa de:

- login por email
- recuperação de senha
- convite para workspace
- sessão persistente

### 2. Controle de acesso

Cada request precisa saber:

- quem é o usuário
- em qual workspace ele está
- se ele pode editar ou só revisar

### 3. Multi-tenant real

Tudo precisa ser filtrado por `workspace_id`.

Se isso não for obrigatório em todas as queries, você corre risco sério de misturar dados entre clientes.

### 4. Jobs em background

Não deixe coleta e geração bloqueando a UI.

Crie jobs para:

- coletar notícias
- atualizar feed ao vivo
- gerar briefs
- gerar drafts
- sincronizar Sheets
- exportar markdown

### 5. Observabilidade

Você precisa no mínimo de:

- logs estruturados
- captura de erro
- histórico de jobs
- trilha de auditoria

---

## Estrutura De Pastas Recomendada

```txt
apps/
  web/
  worker/
packages/
  db/
  auth/
  content-engine/
  integrations/
  shared/
```

### `apps/web`

- interface
- rotas HTTP
- páginas
- autenticação

### `apps/worker`

- coleta de notícias
- geração de briefs
- geração de drafts
- sync de integrações

### `packages/db`

- schema Prisma
- migrations
- queries compartilhadas

### `packages/content-engine`

- scoring editorial
- formatos
- packets
- approved logic

### `packages/integrations`

- Google Sheets
- Notion
- Airtable
- webhook

### `packages/shared`

- types
- helpers
- validação

---

## Páginas Do MVP

### 1. `Login`

- entrar
- recuperar senha

### 2. `Workspace switcher`

- escolher workspace
- criar workspace
- convidar usuário

### 3. `Home`

- status geral
- fila pendente
- aprovados recentes
- atalhos

### 4. `Ao Vivo`

- notícias quentes
- hotspots
- filtros de fonte
- criar roteiro a partir do sinal

### 5. `Radar`

- nicho
- fontes
- janela temporal
- gerar drafts

### 6. `Revisão`

- lista de pendentes
- aprovar/rejeitar
- filtro por formato
- filtro por nicho

### 7. `Approved`

- headline
- template
- render final
- prompt box
- exportação

### 8. `Integrações`

- conectar Sheets
- status da integração
- sync manual

### 9. `Admin do workspace`

- membros
- papéis
- limite de uso
- settings

---

## Autorização

### Regra simples para o MVP

#### `owner`

- tudo

#### `editor`

- criar drafts
- editar approved
- conectar integrações

#### `reviewer`

- aprovar/rejeitar
- comentar
- visualizar approved

---

## Infra Mínima

### Produção do MVP

Você precisa de:

1. `Frontend/API`
2. `Postgres`
3. `Redis`
4. `Storage`
5. `Auth provider`

### Ambientes

- `local`
- `staging`
- `production`

### Variáveis de ambiente

Você vai precisar de algo nesse nível:

```env
DATABASE_URL=
REDIS_URL=
AUTH_SECRET=
CLERK_SECRET_KEY=
CLERK_PUBLISHABLE_KEY=
S3_BUCKET=
S3_REGION=
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
GOOGLE_SHEETS_CLIENT_ID=
GOOGLE_SHEETS_CLIENT_SECRET=
ENCRYPTION_KEY=
APP_URL=
```

### Segredos

Não deixe credenciais em JSON no disco em produção.

As credenciais precisam ficar:

- no provedor de secrets
- criptografadas no banco, se forem por workspace

---

## Google Sheets No Multiusuário

Hoje você usa uma única planilha.

No multiusuário, a integração precisa virar por workspace.

### Opções

#### Mais simples para o MVP

- cada workspace conecta uma planilha própria
- você salva `spreadsheetId`, `sheetName` e credenciais OAuth ou service account por workspace

#### Melhor UX

- OAuth do Google por usuário/workspace
- sem upload manual de JSON

### Recomendação

Para o MVP:

- suporte a 1 planilha por workspace
- integração opcional
- plataforma funciona mesmo sem Sheets

---

## Exportação E Arquivos

Hoje o markdown vai para `output/approved-posts`.

No multiusuário:

- gerar markdown em memória ou worker
- subir para storage
- salvar URL no banco

Exportações úteis:

- markdown
- texto puro
- JSON estruturado
- pacote para design/reels

---

## Regras De Escala Que Já Devem Entrar No MVP

Mesmo no MVP, já inclua:

- paginação
- limites por workspace
- cache por query
- lock para evitar job duplicado
- timeout para coleta
- retry com backoff

---

## Segurança

### Obrigatório

- autenticação real
- autorização por workspace
- criptografia de integrações
- rate limit
- validação de input
- logs de auditoria

### Muito importante

Nunca misture:

- notícias
- drafts
- approvals
- integrações

entre workspaces diferentes.

---

## Roadmap Recomendado

### Fase 1

Colocar a base multiusuário de pé.

- auth
- workspace
- Postgres
- mover JSON para banco
- revisão interna

### Fase 2

Separar jobs.

- worker
- Redis
- coleta async
- geração async

### Fase 3

Integrações por workspace.

- Sheets por workspace
- webhook
- exportações

### Fase 4

Operação e escala.

- billing simples
- limites por plano
- métricas
- observabilidade

---

## O Que Você Precisa Para Rodar O MVP Com Outras Pessoas

Checklist direto:

1. Um domínio
2. Um provedor de deploy
3. Um banco Postgres
4. Um Redis
5. Um provedor de auth
6. Um storage de arquivos
7. Um schema multiusuário com `workspace_id`
8. Revisão interna funcionando sem depender de Sheets
9. Integrações opcionais por workspace
10. Logs e trilha de auditoria

---

## Ordem Exata De Implementação

Se eu fosse construir isso com o menor risco:

1. criar `users`, `workspaces` e `workspace_members`
2. mover `review-queue`, `approved-channel` e `live signals` para Postgres
3. adaptar a UI para trabalhar por workspace
4. colocar login
5. criar revisão interna multiusuário
6. mover coleta para worker
7. adicionar Redis/BullMQ
8. transformar Sheets em integração por workspace
9. mover markdown/export para storage
10. adicionar audit log e limite de uso

---

## Recomendação Final

Não tente abrir para vários usuários mantendo a arquitetura atual baseada em:

- JSON local
- um servidor único guardando estado em memória
- credenciais locais no disco

Isso serve muito bem para o modo local, mas para MVP multiusuário o ponto de virada é:

`Postgres + Auth + Workspace + Worker + Redis`

Essa é a menor arquitetura que já te deixa sério o suficiente para colocar outras pessoas dentro sem gerar bagunça.
