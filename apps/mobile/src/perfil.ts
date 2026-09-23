import { corDerivadaDoNome } from '@compasso/core';
import { perfil, type Perfil } from '@compasso/core/local';
import * as FileSystem from 'expo-file-system/legacy';
import { db } from './db';
import { chamarApi, enviarArquivo, lerConexao, type ConexaoServidor } from './servidor';

interface MeResposta {
  id: string;
  displayName: string;
  avatarKind: 'initials' | 'uploaded';
  avatarPath: string | null;
  accentColor: string;
  defaultReminderMinutes: number | null;
  createdAt: string;
  updatedAt: string;
}

export function perfilLocal(): Perfil | null {
  return db.select().from(perfil).get() ?? null;
}

/**
 * Busca `GET /me` e grava no SQLite. A tela nunca lê a resposta da API: lê a tabela `perfil`.
 * Se há edição local pendente (nome, lembrete padrão), manda `PATCH /me` antes. Sem rede, não
 * faz nada — o que já está no SQLite continua valendo.
 */
export async function atualizarPerfil(): Promise<'ok' | 'sem-conexao' | 'falhou'> {
  const conexao = await lerConexao();
  if (!conexao) return 'sem-conexao';
  try {
    const local = perfilLocal();
    if (local?.pendente) {
      await chamarApi(conexao, '/me', {
        method: 'PATCH',
        body: JSON.stringify({
          displayName: local.displayName,
          defaultReminderMinutes: local.defaultReminderMinutes,
        }),
      });
    }
    await gravar(await chamarApi<MeResposta>(conexao, '/me'), conexao);
    return 'ok';
  } catch {
    return 'falhou';
  }
}

async function gravar(me: MeResposta, conexao: ConexaoServidor): Promise<void> {
  const avatarLocal = await baixarFoto(me, conexao);
  const linha = {
    id: me.id,
    displayName: me.displayName,
    avatarKind: me.avatarKind,
    avatarPath: me.avatarPath,
    accentColor: me.accentColor,
    defaultReminderMinutes: me.defaultReminderMinutes,
    createdAt: new Date(me.createdAt),
    updatedAt: new Date(me.updatedAt),
    buscadoEm: new Date(),
    pendente: false,
    avatarLocal,
  };
  // Transação síncrona: o driver do expo-sqlite no Drizzle é síncrono, e um callback async
  // deixaria o segundo comando rodar depois do commit.
  db.transaction((tx) => {
    // Uma conta por aparelho: trocar de token troca o perfil inteiro.
    tx.delete(perfil).run();
    tx.insert(perfil).values(linha).run();
  });
}

/**
 * A foto é servida pelo Nginx em `/avatares/<arquivo>` (especificação §7). Baixa uma vez para o
 * armazenamento do app, para aparecer offline; o nome do arquivo muda a cada troca de foto.
 */
async function baixarFoto(me: MeResposta, conexao: ConexaoServidor): Promise<string | null> {
  if (me.avatarKind !== 'uploaded' || !me.avatarPath || !FileSystem.documentDirectory) return null;
  const destino = `${FileSystem.documentDirectory}avatar-${me.avatarPath}`;
  const info = await FileSystem.getInfoAsync(destino);
  if (info.exists) return destino;
  try {
    const r = await FileSystem.downloadAsync(`${conexao.url}/avatares/${me.avatarPath}`, destino);
    return r.status === 200 ? destino : null;
  } catch {
    return null;
  }
}

/**
 * Nome e lembrete padrão editados offline: gravados no SQLite na hora (as iniciais e a cor mudam
 * já) e enviados na próxima conexão.
 */
export function salvarPreferencias(m: {
  displayName?: string;
  defaultReminderMinutes?: number | null;
}): void {
  const atual = perfilLocal();
  if (!atual) throw new Error('perfil ainda não carregado: conecte ao servidor uma vez');
  const nome = m.displayName?.trim() || atual.displayName;
  db.update(perfil)
    .set({
      displayName: nome,
      accentColor: corDerivadaDoNome(nome),
      ...(m.defaultReminderMinutes !== undefined
        ? { defaultReminderMinutes: m.defaultReminderMinutes }
        : {}),
      pendente: true,
    })
    .run();
  void atualizarPerfil();
}

/** Foto de perfil: exige rede (o servidor redimensiona). */
export async function enviarFoto(arquivo: {
  uri: string;
  name: string;
  mimeType?: string;
}): Promise<void> {
  const conexao = await lerConexao();
  if (!conexao) throw new Error('configure o servidor primeiro');
  await gravar(await enviarArquivo<MeResposta>(conexao, '/me/avatar', arquivo, 'PUT'), conexao);
}

export async function removerFoto(): Promise<void> {
  const conexao = await lerConexao();
  if (!conexao) throw new Error('configure o servidor primeiro');
  await gravar(await chamarApi<MeResposta>(conexao, '/me/avatar', { method: 'DELETE' }), conexao);
}
