import { FUSO_PADRAO } from '@compasso/core';
import { metadados } from '@compasso/core/local';
import { eq } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { Text } from 'react-native';
import { db } from '../db';
import { useEstadoSync } from '../hooks';
import { useTema } from '../tema';

/**
 * Indicador discreto (issue #88): sincronizando, sem rede, ou quando foi a última sincronização.
 * Sem rede não é erro — o Compasso funciona offline; é só informação.
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
  const texto =
    estado === null
      ? 'sincronizando…'
      : estado?.tipo === 'falhou'
        ? `sem rede · dados deste aparelho (última sync ${quando})`
        : estado?.tipo === 'sem-conexao'
          ? 'servidor não configurado · só neste aparelho'
          : `sincronizado ${quando}`;
  return <Text style={{ color: tema.sutil, fontSize: 11 }}>{texto}</Text>;
}
