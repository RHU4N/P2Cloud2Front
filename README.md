# P2Cloud2Front

Interface React (JavaScript) com Vite para consultar arquivos no Google Drive, consultar arquivos no Azure Blob Storage e executar a migração pela API do backend.

## Tecnologias

- React + Vite (JavaScript)
- CSS comum
- `fetch` para consumo da API REST

## Configuração

Copie `.env.example` para `.env` e informe a URL do backend:

```dotenv
VITE_API_URL=http://localhost:3000
```

O token administrativo (`APP_ACCESS_TOKEN`) não deve ser colocado no build; ele é digitado na tela e mantido apenas em memória.

## Execução local

```bash
npm install
npm run dev
```

Para gerar o build de produção:

```bash
npm run build
```

## Publicação na Vercel

- **Framework Preset:** Vite
- **Build Command:** `npm run build`
- **Output Directory:** `dist`
- **Variável de ambiente:** `VITE_API_URL` apontando para a URL HTTPS do backend no Render.
