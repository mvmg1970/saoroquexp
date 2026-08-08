# Checklist de Deploy — Render

## Pré-requisitos já prontos
- [x] Repositório público criado: `mvmg1970/saoroquexp`
- [x] Branch `main` publicada
- [x] `render.yaml` presente na raiz
- [x] `server.js` responde em `PORT`
- [x] Health check em `GET /health`
- [x] Build sem dependências externas obrigatórias

## Checklist no painel do Render
1. Acesse o painel do Render.
2. Clique em **New +** → **Blueprint**.
3. Conecte o repositório `mvmg1970/saoroquexp`.
4. Confirme que o Render detectou o `render.yaml`.
5. Verifique os campos:
   - **Name**: `saoroquexp`
   - **Environment**: `Node`
   - **Branch**: `main`
   - **Auto-Deploy**: ligado
6. Faça o deploy inicial.
7. Aguarde o status **Live**.
8. Abra a URL pública e valide:
   - `GET /health`
   - página inicial `/`

## Validação pós-deploy
- [ ] `/health` retorna `200` com `{"ok":true,"service":"saoroque_xp"}`
- [ ] A interface abre no navegador
- [ ] O envio de mensagem responde no chat
- [ ] O botão de atalho gera sugestão
- [ ] O painel do Render mostra os logs sem erro

## Se algo falhar
- Se o serviço subir mas a página não abrir, revisar `startCommand` e `PORT`.
- Se o health check falhar, confirmar que o caminho é exatamente `/health`.
- Se o deploy não detectar o serviço, garantir que `render.yaml` está na raiz do repo.
