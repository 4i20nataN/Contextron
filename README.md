# Mega Context Analyzer - Guia de Execução Local

Este projeto foi desenvolvido com uma arquitetura de alta performance focada em Auditoria de Código M2M. Siga os passos abaixo para rodar o ambiente completo no seu VS Code.

## 🚀 Pré-requisitos

1. **Node.js** (Versão 18 ou superior recomendada)
2. **NPM** ou **Yarn**
3. **Chave de API**:
   - **Google Gemini**: Obtenha em [aistudio.google.com](https://aistudio.google.com/app/apikey)
   - **OpenRouter**: (Opcional) Caso queira usar modelos como Claude ou GPT-4.

## 🛠️ Instalação Passo a Passo

1. **Garanta que você tem o projeto**:
   ```bash
   # Se estiver clonando
   git clone <url-do-repositorio>
   cd mega-context-analyzer
   ```

2. **Instale as Dependências**:
   No terminal do VS Code, execute:
   ```bash
   npm install
   ```

3. **Configuração de Variáveis de Ambiente**:
   Crie um arquivo `.env` na raiz do projeto (opcional, já que o app permite injetar a chave via UI, mas recomendado para bypassar o lock inicial):
   ```env
   VITE_GEMINI_API_KEY=sua_chave_aqui
   ```

4. **Inicie o Servidor de Desenvolvimento**:
   ```bash
   npm run dev
   ```

5. **Acesse a Aplicação**:
   O Vite abrirá uma porta (geralmente `http://localhost:3000` ou `5173`). O link aparecerá no terminal.

## 🧠 Como usar o Skill Injector Localmente

- Você pode arrastar pastas inteiras do seu projeto para o campo de upload.
- Para injetar regras personalizadas, use arquivos `.md` contendo padrões de projeto (ex: `solid_rules.md`).
- **Neural Temp**: Para refatorações de código, mantenha entre **0.0 e 0.2**.

## 🛑 Troubleshooting (Solução de Problemas)

- **Erro 404 Modelo Não Encontrado**: Verifique se o nome do modelo está correto nas configurações (o app já adiciona o prefixo `models/` automaticamente para o Google).
- **Limite de Tokens**: Arquivos muito grandes podem ser barrados pela cota gratuita da API. Use a segmentação por **Lotes (Phase 1)** para processar partes menores.

---
*Desenvolvido com ❤️ no Google AI Studio Build.*
