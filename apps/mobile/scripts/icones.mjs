/**
 * Gera os PNGs do ícone do app a partir da rosa dos ventos do `Emblema` (src/ui/Icones.tsx,
 * variante da abertura), nas cores do tema. Os PNGs ficam versionados em assets/; só rode de novo
 * se o desenho mudar:
 *
 *   node scripts/icones.mjs
 *
 * Usa o `sharp` que já vem no node_modules pelas dependências do Expo (não é dependência direta).
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const assets = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets');

// Cores de src/tema.ts.
const FUNDO = '#E7D8BB'; // cabecalho
const OURO = '#96742A';
const OURO_CLARO = '#C2A85F';
const OURO_ESCURO = '#7A5E20';
const FOLHA = '#F3E7CC';

/** Rosa dos ventos no viewBox 0 0 64 64, traços um pouco mais grossos que na tela. */
function rosa(mono) {
  const c = (cor) => (mono ? '#FFFFFF' : cor);
  return `
    <circle cx="32" cy="32" r="29" fill="none" stroke="${c(OURO)}" stroke-width="2"/>
    <circle cx="32" cy="32" r="24" fill="none" stroke="${c(OURO_CLARO)}" stroke-width="1.2"/>
    <path d="M32 8 36.5 32 32 56 27.5 32Z" fill="${c(OURO)}"/>
    <path d="M8 32 32 27.5 56 32 32 36.5Z" fill="${c(OURO_CLARO)}" opacity="${mono ? 0.7 : 0.75}"/>
    ${mono ? '' : `<circle cx="32" cy="32" r="2.6" fill="${FOLHA}" stroke="${OURO_ESCURO}"/>`}`;
}

/**
 * SVG quadrado de `lado` px com a rosa ocupando `fracao` do lado, centrada. `fundo` null deixa
 * transparente.
 */
function svg(lado, fracao, { fundo = null, mono = false } = {}) {
  const t = (lado * fracao) / 64;
  const d = (lado - lado * fracao) / 2;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${lado}" height="${lado}">
    ${fundo ? `<rect width="100%" height="100%" fill="${fundo}"/>` : ''}
    <g transform="translate(${d} ${d}) scale(${t})">${rosa(mono)}</g>
  </svg>`);
}

async function gerar(nome, buffer) {
  await sharp(buffer).png().toFile(join(assets, nome));
  console.log(`assets/${nome}`);
}

// iOS e ícone legado do Android: fundo opaco, rosa com folga nas bordas.
await gerar('icon.png', svg(1024, 0.78, { fundo: FUNDO }));
// Ícone adaptativo: o launcher recorta até ~61% do centro (66dp de 108dp); a rosa cabe nisso.
await gerar('android-icon-foreground.png', svg(1024, 0.56));
await gerar('android-icon-monochrome.png', svg(1024, 0.56, { mono: true }));
await gerar('android-icon-background.png', svg(1024, 0, { fundo: FUNDO }));
await gerar('favicon.png', svg(48, 0.9, { fundo: FUNDO }));
await gerar('splash-icon.png', svg(1024, 0.6));
