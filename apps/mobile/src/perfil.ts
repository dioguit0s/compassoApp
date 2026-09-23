import { perfil } from '@compasso/core/local';
import { db } from './db';
import { chamarApi, lerConexao } from './servidor';

interface MeResposta {
  id: string;
  displayName: string;
  avatarKind: 'initials' | 'uploaded';
  avatarPath: string | null;
  accentColor: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Busca `GET /me` e grava no SQLite. A tela nunca lê a resposta da API: lê a tabela `perfil`.
 * Sem rede ou sem conexão configurada, não faz nada — o que já está no SQLite continua valendo.
 */
export async function atualizarPerfil(): Promise<'ok' | 'sem-conexao' | 'falhou'> {
  const conexao = await lerConexao();
  if (!conexao) return 'sem-conexao';
  try {
    const me = await chamarApi<MeResposta>(conexao, '/me');
    const linha = {
      id: me.id,
      displayName: me.displayName,
      avatarKind: me.avatarKind,
      avatarPath: me.avatarPath,
      accentColor: me.accentColor,
      createdAt: new Date(me.createdAt),
      updatedAt: new Date(me.updatedAt),
      buscadoEm: new Date(),
    };
    await db.transaction(async (tx) => {
      // Uma conta por aparelho: trocar de token troca o perfil inteiro.
      await tx.delete(perfil);
      await tx.insert(perfil).values(linha);
    });
    return 'ok';
  } catch {
    return 'falhou';
  }
}
