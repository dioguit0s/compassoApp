import { FUSO_PADRAO } from '@compasso/core';
import { metadados } from '@compasso/core/local';
import { eq } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { View } from 'react-native';
import { db } from '../db';
import { useEstadoSync } from '../hooks';
import { useTema } from '../tema';
import { Ponto } from './Icones';
import { Texto } from './Texto';

/**
 * Indicador discreto (issue #88): sincronizando, sem rede, erro do servidor, ou quando foi a
 * última sincronização.
 * Sem rede não é erro — o Compasso funciona offline; é só informação (ponto vazado).
 */
export function IndicadorSync() {
  const tema = useTema();
  const estado = useEstadoSync();
  const { data } = useLiveQuery(
    db.select().from(metadados).where(eq(metadados.chave, 'ultimaSync')),
  );
  const ultima = data[0] ? new Date(Number(data[0].valor)) : null;
  const quando = ultima
    ? ultima.toLocaleString('pt-BR', {
        timeZone: FUSO_PADRAO,
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'nunca';
  // Ponto cheio: sincronizado (ou a caminho). Vazado: dados só deste aparelho por enquanto.
  const vazado = estado !== null && estado !== undefined && estado.tipo !== 'ok';
  const texto =
    estado === null
      ? 'sincronizando…'
      : estado?.tipo === 'falhou'
        ? estado.semRede
          ? `sem rede · dados deste aparelho (última sync ${quando})`
          : `erro ao sincronizar (${estado.mensagem}) · dados deste aparelho`
        : estado?.tipo === 'sem-conexao'
          ? 'servidor não configurado · só neste aparelho'
          : estado?.tipo === 'sessao-encerrada'
            ? 'sessão encerrada · entre de novo no Perfil'
            : `sincronizado ${quando}`;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <Ponto cor={vazado ? tema.rotulo : tema.ouro} vazado={vazado} />
      <Texto style={{ color: tema.rotulo, fontSize: 11, flexShrink: 1 }} numberOfLines={1}>
        {texto}
      </Texto>
    </View>
  );
}
