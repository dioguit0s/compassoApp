import { Hono } from 'hono';
import { ARQUIVO_APK, base, lerApkPublicado, type ApkPublicado } from './atualizacoes';
import type { Config } from './config';

/**
 * Página de download na raiz da API: o link que se manda aos amigos, no lugar do APK. Lê o mesmo
 * android.json do atualizador (ADR-0013) e segue o visual do app (códice, `apps/mobile/src/tema.ts`).
 * HTML montado aqui, sem JS no navegador; pública como as rotas de atualização.
 */

const CSP = [
  "default-src 'none'",
  'img-src data:',
  "style-src 'unsafe-inline' https://fonts.googleapis.com",
  'font-src https://fonts.gstatic.com',
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

function escaparHtml(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** O ícone do app (assets/icon.png) redesenhado em vetor: aro, rosa dos ventos e centro. */
const ROSA = `
  <circle cx="512" cy="512" r="362" fill="none" stroke="#96742A" stroke-width="26"/>
  <circle cx="512" cy="512" r="300" fill="none" stroke="#C2A85F" stroke-width="14"/>
  <polygon points="512,212 560,512 512,812 464,512" fill="#96742A"/>
  <polygon points="218,512 512,456 806,512 512,568" fill="#C2A85F" fill-opacity="0.78"/>
  <circle cx="512" cy="512" r="39" fill="#7A5E20"/>
  <circle cx="512" cy="512" r="26" fill="#F2E6CC"/>`;

const FAVICON = `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><rect width="1024" height="1024" rx="200" fill="#E7D8BB"/>${ROSA}</svg>`,
)}`;

const ESTILO = `
:root {
  --fundo: #EFE3CC; --cabecalho: #E7D8BB; --cartao: #F7EEDC; --campo: #FBF4E4;
  --borda: #CDBB98; --divisoria: #DFD0B3;
  --texto: #241C12; --texto2: #4A3B28; --sutil: #6B5B45; --rotulo: #7A6647; --apagado: #8C7B60;
  --ouro: #96742A; --ouro-escuro: #7A5E20; --ouro-claro: #C2A85F; --ouro-fundo: #F6E9C6;
  --sobre-ouro: #F5EBD3;
  --cinzel: 'Cinzel', 'Trajan Pro', Georgia, serif;
  --archivo: 'Archivo', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
}
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body {
  margin: 0; min-height: 100vh; color: var(--texto); font: 400 16px/1.55 var(--archivo);
  background: var(--fundo);
  background-image: radial-gradient(ellipse at 50% 0%, #F5EBD6 0%, var(--fundo) 55%, #E6D6B8 100%);
  background-attachment: fixed;
}
main { max-width: 520px; margin: 0 auto; padding: 40px 18px 32px; }
.cabeca { text-align: center; }
.cabeca svg { width: 104px; height: 104px; display: block; margin: 0 auto 14px; }
h1 {
  margin: 0; font: 700 34px/1.1 var(--cinzel); letter-spacing: 0.14em; text-indent: 0.14em;
}
.lema { margin: 10px auto 0; max-width: 34ch; color: var(--sutil); font-size: 15.5px; }
.ornato {
  display: flex; align-items: center; gap: 12px; margin: 30px 4px; color: var(--ouro-claro);
}
.ornato::before, .ornato::after { content: ''; flex: 1; height: 1px; background: var(--borda); }
.ornato span { width: 7px; height: 7px; background: currentColor; transform: rotate(45deg); }
.cartao {
  background: var(--cartao); border: 1px solid var(--borda); border-radius: 14px; padding: 22px;
  box-shadow: 0 1px 0 #FFF8EA inset, 0 6px 18px -12px rgba(59, 47, 35, 0.45);
}
.rotulo {
  margin: 0; color: var(--rotulo); font: 600 11.5px/1 var(--cinzel); letter-spacing: 0.16em;
  text-transform: uppercase;
}
.versao { margin: 8px 0 2px; font: 700 40px/1.1 var(--cinzel); color: var(--texto); }
.meta { margin: 0; color: var(--sutil); font-size: 14px; }
.notas {
  margin: 16px 0 0; padding: 12px 14px; background: var(--ouro-fundo); border-left: 3px solid var(--ouro-claro);
  border-radius: 4px 8px 8px 4px; color: var(--texto2); font-size: 14.5px; white-space: pre-line;
}
.botao {
  display: flex; align-items: center; justify-content: center; gap: 10px; margin-top: 20px;
  padding: 15px 18px; border-radius: 10px; background: var(--ouro); color: var(--sobre-ouro);
  border: 1px solid var(--ouro-escuro); font: 700 15px/1 var(--cinzel); letter-spacing: 0.08em;
  text-decoration: none; text-transform: uppercase;
  box-shadow: 0 1px 0 rgba(255, 240, 200, 0.35) inset, 0 4px 12px -6px rgba(122, 94, 32, 0.8);
}
.botao:hover { background: var(--ouro-escuro); }
.botao:focus-visible { outline: 3px solid var(--ouro-claro); outline-offset: 3px; }
.botao svg { width: 18px; height: 18px; flex: none; }
.aviso { margin: 12px 0 0; color: var(--apagado); font-size: 13px; text-align: center; }
.vazio { margin: 10px 0 0; color: var(--texto2); }
h2 { margin: 0 0 14px; font: 700 19px/1.2 var(--cinzel); letter-spacing: 0.06em; }
ol { list-style: none; margin: 0; padding: 0; counter-reset: passo; }
li {
  counter-increment: passo; display: grid; grid-template-columns: 34px 1fr; gap: 0 12px;
  padding: 12px 0; border-top: 1px solid var(--divisoria); color: var(--texto2);
}
li:first-child { border-top: 0; padding-top: 0; }
li::before {
  content: counter(passo, upper-roman); color: var(--ouro); font: 700 18px/1.45 var(--cinzel);
  text-align: center;
}
strong { color: var(--texto); font-weight: 600; }
code {
  display: block; margin-top: 6px; padding: 7px 10px; background: var(--campo);
  border: 1px solid var(--borda); border-radius: 6px; color: var(--texto); white-space: nowrap;
  overflow-x: auto; font: 500 13px/1.4 ui-monospace, 'Cascadia Mono', Menlo, Consolas, monospace;
}
section + section { margin-top: 30px; }
footer {
  margin-top: 36px; color: var(--apagado); font: 500 11.5px/1.6 var(--cinzel); letter-spacing: 0.14em;
  text-align: center; text-transform: uppercase;
}
`;

const SETA = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v11"/><path d="m7 11 5 5 5-5"/><path d="M5 20h14"/></svg>`;

function dataPublicacao(iso: string, fuso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('pt-BR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: fuso,
  });
}

function megabytes(bytes: number): string {
  return `${(bytes / 1024 / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}\u00a0MB`;
}

function cartaoDaVersao(apk: ApkPublicado | null, fuso: string): string {
  if (!apk) {
    return `
      <div class="cartao">
        <p class="rotulo">Versão atual</p>
        <p class="vazio">Ainda não há versão publicada. Volte daqui a pouco.</p>
      </div>`;
  }
  const quando = dataPublicacao(apk.publicadoEm, fuso);
  const meta = [quando && `publicada em ${quando}`, megabytes(apk.tamanho)]
    .filter(Boolean)
    .join(' · ');
  const notas = apk.notas?.trim() ? `<p class="notas">${escaparHtml(apk.notas.trim())}</p>` : '';
  return `
      <div class="cartao">
        <p class="rotulo">Versão atual</p>
        <p class="versao">${escaparHtml(apk.versionName)}</p>
        <p class="meta">${escaparHtml(meta)}</p>
        ${notas}
        <a class="botao" href="/app/android/${apk.arquivo}" download>${SETA}Baixar para Android</a>
        <p class="aviso">Arquivo .apk, instalado fora da Play Store.</p>
      </div>`;
}

function pagina(apk: ApkPublicado | null, servidor: string, fuso: string): string {
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<meta name="theme-color" content="#E7D8BB">
<title>Compasso</title>
<meta name="description" content="Baixe o Compasso para Android: calendário e registro de esforço num lugar só.">
<meta property="og:title" content="Compasso">
<meta property="og:description" content="Calendário e registro de esforço num lugar só. Baixe o app para Android.">
<link rel="icon" href="${FAVICON}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600&family=Cinzel:wght@600;700&display=swap">
<style>${ESTILO}</style>
</head>
<body>
<main>
  <header class="cabeca">
    <svg viewBox="0 0 1024 1024" role="img" aria-label="Rosa dos ventos do Compasso">${ROSA}</svg>
    <h1>Compasso</h1>
    <p class="lema">Seu calendário e o registro do seu esforço, num lugar só.</p>
  </header>

  <div class="ornato" aria-hidden="true"><span></span></div>
  ${cartaoDaVersao(apk, fuso)}
  <div class="ornato" aria-hidden="true"><span></span></div>

  <section>
    <h2>Como instalar</h2>
    <ol>
      <li><span>Toque em <strong>Baixar para Android</strong> e abra o arquivo quando o download terminar.</span></li>
      <li><span>Se o Android pedir, permita que o navegador <strong>instale apps desconhecidos</strong>. O aviso aparece porque o app não vem da Play Store.</span></li>
      <li><span>Toque em <strong>Instalar</strong>. Daqui em diante, as atualizações chegam pelo próprio app.</span></li>
    </ol>
  </section>

  <section>
    <h2>Primeiro acesso</h2>
    <ol>
      <li><span>Peça um <strong>código de convite</strong> a quem te mandou este link.</span></li>
      <li><span>No app, abra <strong>Perfil</strong> e escolha <strong>Tenho um convite</strong>.</span></li>
      <li><span>No campo <strong>Servidor</strong>, use:<code>${escaparHtml(servidor)}</code></span></li>
    </ol>
  </section>

  <footer>Só para Android · fora da Play Store</footer>
</main>
</body>
</html>
`;
}

/**
 * APK publicado com nome válido, ou null (o mesmo filtro de GET /app/android). Confere também o
 * que a página mostra: um android.json incompleto não pode derrubar a raiz da API.
 */
async function apkAtual(config: Config): Promise<ApkPublicado | null> {
  const apk = await lerApkPublicado(config);
  if (!apk || typeof apk.arquivo !== 'string' || !ARQUIVO_APK.test(apk.arquivo)) return null;
  if (typeof apk.versionName !== 'string' || !Number.isFinite(apk.tamanho)) return null;
  return apk;
}

export function rotasDoSite(config: Config) {
  const app = new Hono();

  app.get('/', async (c) => {
    const html = pagina(await apkAtual(config), base(c, config), config.tzDefault);
    return c.html(html, 200, {
      // O APK muda sem a URL mudar: sempre revalida.
      'cache-control': 'no-cache',
      'content-security-policy': CSP,
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
    });
  });

  // Link curto e estável para compartilhar: sempre o APK mais recente.
  app.get('/baixar', async (c) => {
    const apk = await apkAtual(config);
    if (!apk) return c.notFound();
    c.header('cache-control', 'no-store');
    return c.redirect(`${base(c, config)}/app/android/${apk.arquivo}`, 302);
  });

  return app;
}
