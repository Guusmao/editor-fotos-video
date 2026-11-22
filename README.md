# Revelador · fotos e vídeo

App instalável (PWA) com dois editores que rodam inteiros no celular, sem enviar nada para servidores:

- **Fotos** (`fotos/`): o Revelador. Corrige várias fotos de corrida de uma vez (exposição, cor, contraste), aplica o filtro Esporte, recorta em 4:5 seguindo o corredor e salva em 1080 × 1350 px, pronto para o Instagram.
- **Vídeo** (`video/`): o Rolo. Linha do tempo com várias faixas, cortes, velocidade, filtros, efeitos, transições, texto, legendas automáticas, música, remoção de fundo e exportação.

## Instalar no Android

1. Abra o site no Chrome.
2. Toque em **Instalar app** (ou nos três pontinhos › **Instalar app**).
3. Mantenha o ícone pressionado para ir direto em "Fotos em lote" ou "Editar vídeo".

Pela galeria: selecione fotos ou vídeos, toque em **Compartilhar** e escolha **Revelador**. Se forem só fotos, elas abrem no editor de fotos. Se houver um vídeo ou áudio, abrem no editor de vídeo.

## Estrutura

- `index.html`: tela inicial com as duas opções.
- `manifest.webmanifest`, `sw.js`: um só app instalável e um só service worker para os dois editores (modo offline e recebimento de arquivos compartilhados).
- `fotos/`: editor de fotos (um único arquivo HTML; `vendor/jszip.min.js` gera o .zip).
- `video/`: editor de vídeo (`js/`, `css/`, `vendor/` com transformers.js, onnxruntime e MediaPipe).
