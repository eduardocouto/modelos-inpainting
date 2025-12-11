# Modelos Inpainting

Testes de inpainting com **GPT-Image 1** (gpt-image-1) da OpenAI.

## GPT-Image 1 vs DALL-E 3

| Feature | DALL-E 3 | GPT-Image 1 |
|---------|----------|-------------|
| Inpainting nativo | No | **Yes** |
| Suporte a máscaras | No | **Yes** |
| Edição de imagens | No | **Yes** |
| Qualidade | HD | Low/Medium/High |

## Instalacao

```bash
npm install
cp .env.example .env
# Adicionar OPENAI_API_KEY ao .env
```

## Uso

### Linha de comando

```bash
node index.js <imagem> <mascara> "<prompt>" [opcoes]
```

Exemplo:
```bash
node index.js foto.jpg mascara.png "um jardim com flores coloridas"
node index.js edificio.png telhado_mask.png "paineis solares no telhado" --quality=high
```

### Opcoes

- `--size=<size>` - Tamanho: 1024x1024, 1536x1024, 1024x1536 (default: auto)
- `--quality=<q>` - Qualidade: low, medium, high (default: high)
- `--output=<dir>` - Directorio de output (default: ./output)

### Como modulo

```javascript
import { inpaint, batchInpaint, createRectMask } from './index.js';

// Inpainting simples
const result = await inpaint('foto.jpg', 'mascara.png', 'um ceu azul com nuvens');

// Batch - multiplos prompts na mesma imagem
const results = await batchInpaint('foto.jpg', 'mascara.png', [
  'ceu azul limpo',
  'ceu de por do sol',
  'ceu noturno com estrelas'
]);

// Criar mascara rectangular
await createRectMask(1024, 1024, { x: 100, y: 100, w: 300, h: 200 }, 'mascara.png');
```

## Formato da Mascara

```
Branco (255) = Area a EDITAR
Preto (0)    = Area a MANTER
```

A mascara e automaticamente convertida para o formato que o GPT-Image 1 espera (canal alpha com transparencia).

## Testes

```bash
# Teste simples (cria imagens de teste e executa inpainting)
npm test

# Teste batch (multiplos prompts)
npm run test:batch

# Apenas criar mascaras de exemplo
npm run test:masks

# Apenas criar imagens de teste (sem API)
npm run test:create
```

## Funcoes Disponiveis

| Funcao | Descricao |
|--------|-----------|
| `inpaint()` | Inpainting com GPT-Image 1 |
| `batchInpaint()` | Multiplos prompts na mesma imagem |
| `createRectMask()` | Criar mascara rectangular |
| `createCircleMask()` | Criar mascara circular |
| `convertMaskToAlpha()` | Converter mascara B/W para alpha |
| `prepareImage()` | Preparar imagem para API |

## Custos (Dezembro 2025)

GPT-Image 1 pricing:
- Low quality: ~$0.02 por imagem
- Medium quality: ~$0.04 por imagem
- High quality: ~$0.08 por imagem

## License

MIT
