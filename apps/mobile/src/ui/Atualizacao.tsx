import * as Updates from 'expo-updates';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  adiarApk,
  apkAdiadoHoje,
  baixarApk,
  instalarApk,
  limparApksBaixados,
  procurarApk,
  type ApkDisponivel,
} from '../atualizacao';
import { useTema } from '../tema';
import { useAlturaDoAviso } from './Aviso';
import { useAlerta } from './Dialogo';
import { Texto } from './Texto';

/**
 * Procurar atualização: `automatico` na abertura (respeita o "Depois"), manual em Configurações
 * (sempre pergunta, e diz quando não há nada).
 */
type Procurar = (modo: 'automatico' | 'manual') => Promise<void>;

const Contexto = createContext<Procurar>(async () => {});

/**
 * Atualizações do app (ADR-0013): na abertura e ao voltar para o app procura APK novo. O OTA o
 * expo-updates baixa sozinho; quando um fica pronto, a barra oferece reiniciar (se a pessoa não
 * tocar, ele entra na próxima abertura).
 */
export function ProvedorDeAtualizacao({ children }: { children: ReactNode }) {
  const tema = useTema();
  const { bottom } = useSafeAreaInsets();
  const alerta = useAlerta();
  const alturaDoAviso = useAlturaDoAviso();
  const { isUpdatePending } = Updates.useUpdates();
  const [progresso, setProgresso] = useState<number | null>(null);
  const [otaDispensado, setOtaDispensado] = useState(false);
  const ocupado = useRef(false);

  const instalar = useCallback(
    async ({ apk }: ApkDisponivel) => {
      // Quem cancela no instalador volta ao app, e a volta procura de novo: sem isto o mesmo
      // diálogo reapareceria na hora. Obrigatória ignora o adiamento e pergunta de novo.
      adiarApk(apk.versionCode);
      setProgresso(0);
      try {
        const arquivo = await baixarApk(apk, setProgresso);
        await instalarApk(arquivo);
      } catch (e) {
        alerta(
          'Não deu para atualizar',
          e instanceof Error ? e.message : 'o download falhou; tente de novo com rede',
        );
      } finally {
        setProgresso(null);
      }
    },
    [alerta],
  );

  const procurar = useCallback<Procurar>(
    async (modo) => {
      if (ocupado.current) return;
      ocupado.current = true;
      try {
        let disponivel: ApkDisponivel | null;
        try {
          disponivel = await procurarApk();
        } catch {
          if (modo === 'manual') {
            alerta(
              'Sem resposta do servidor',
              'Não deu para procurar atualização agora. Confira a rede e tente de novo.',
            );
          }
          return;
        }
        if (!disponivel) {
          if (modo === 'manual') {
            // O OTA também é procurado: o manual não espera a próxima abertura.
            const ota = await procurarOta();
            alerta(
              ota ? 'Atualização baixada' : 'Tudo em dia',
              ota
                ? 'Reinicie o app pela barra embaixo para usar a versão nova.'
                : 'Você já está na versão mais recente.',
            );
          }
          return;
        }
        const { apk, obrigatoria } = disponivel;
        if (modo === 'automatico' && !obrigatoria && apkAdiadoHoje(apk.versionCode)) return;
        const mb = (apk.tamanho / 1024 / 1024).toFixed(0);
        alerta(
          `Versão ${apk.versionName} disponível`,
          [
            apk.notas,
            obrigatoria ? 'Esta versão é necessária para continuar sincronizando.' : '',
            `Download de ${mb} MB.`,
          ]
            .filter(Boolean)
            .join('\n\n'),
          [
            { text: 'Atualizar', onPress: () => void instalar(disponivel) },
            ...(obrigatoria
              ? []
              : [
                  {
                    text: 'Depois',
                    style: 'cancel' as const,
                    onPress: () => adiarApk(apk.versionCode),
                  },
                ]),
          ],
        );
      } finally {
        ocupado.current = false;
      }
    },
    [alerta, instalar],
  );

  useEffect(() => {
    limparApksBaixados();
    void procurar('automatico');
    const sub = AppState.addEventListener('change', (estado) => {
      if (estado === 'active') void procurar('automatico');
    });
    return () => sub.remove();
  }, [procurar]);

  const barra = progresso !== null || (isUpdatePending && !otaDispensado);
  return (
    <Contexto.Provider value={procurar}>
      {children}
      {barra ? (
        <View
          style={[
            estilos.barra,
            // Logo acima das abas, como a barra de avisos; com um aviso na tela, sobe acima dele.
            {
              bottom: 76 + bottom + (alturaDoAviso ? alturaDoAviso + 8 : 0),
              backgroundColor: tema.noite,
              borderColor: tema.noiteBorda,
            },
          ]}
          accessibilityLiveRegion="polite"
        >
          <Texto style={[estilos.texto, { color: tema.noiteTexto }]}>
            {progresso !== null
              ? `Baixando a atualização… ${Math.round(progresso * 100)}%`
              : 'Atualização pronta.'}
          </Texto>
          {progresso === null ? (
            <>
              <Pressable hitSlop={10} onPress={() => setOtaDispensado(true)}>
                <Texto cinzel style={[estilos.acao, { color: tema.noiteTexto }]}>
                  DEPOIS
                </Texto>
              </Pressable>
              <Pressable hitSlop={10} onPress={() => void Updates.reloadAsync()}>
                <Texto cinzel style={[estilos.acao, { color: tema.noiteAcao }]}>
                  REINICIAR
                </Texto>
              </Pressable>
            </>
          ) : null}
        </View>
      ) : null}
    </Contexto.Provider>
  );
}

/** Pede ao expo-updates um OTA agora. True se baixou um (fica pendente até reiniciar). */
async function procurarOta(): Promise<boolean> {
  if (!Updates.isEnabled) return false;
  try {
    const { isAvailable } = await Updates.checkForUpdateAsync();
    if (!isAvailable) return false;
    const { isNew } = await Updates.fetchUpdateAsync();
    return isNew;
  } catch {
    return false;
  }
}

export function useProcurarAtualizacao() {
  return useContext(Contexto);
}

const estilos = StyleSheet.create({
  barra: {
    position: 'absolute',
    left: 14,
    right: 14,
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 13,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 10 },
  },
  texto: { flex: 1, fontSize: 13 },
  acao: { fontSize: 12, letterSpacing: 1.7, fontWeight: '600' },
});
