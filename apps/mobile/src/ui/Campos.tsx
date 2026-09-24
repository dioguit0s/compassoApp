import type { ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { useTema } from '../tema';
import { Entrada, Texto } from './Texto';

/** Rótulo em capitulares: "ESFORÇO", "QUANDO", "NOME". */
export function Rotulo({ children, tamanho = 9.5 }: { children: string; tamanho?: number }) {
  const tema = useTema();
  return (
    <Texto cinzel style={{ fontSize: tamanho, letterSpacing: tamanho * 0.23, color: tema.rotulo }}>
      {children.toLocaleUpperCase('pt-BR')}
    </Texto>
  );
}

/** Título de seção com o fio até a margem: "ITENS DO DIA ————". */
export function Secao({ titulo, dica }: { titulo: string; dica?: string }) {
  const tema = useTema();
  return (
    <View style={estilos.secao}>
      <Rotulo tamanho={10}>{titulo}</Rotulo>
      <View style={[estilos.fio, { backgroundColor: tema.linha }]} />
      {dica ? (
        <Texto style={{ fontSize: 10, color: tema.apagado, fontStyle: 'italic' }}>{dica}</Texto>
      ) : null}
    </View>
  );
}

/** Campo de texto com rótulo em capitulares, no estilo dos formulários do app. */
export function Campo({
  rotulo,
  erro,
  cinzel,
  style,
  ...props
}: { rotulo?: string; erro?: string | null; cinzel?: boolean } & TextInputProps) {
  const tema = useTema();
  return (
    <View style={estilos.campo}>
      {rotulo ? <Rotulo>{rotulo}</Rotulo> : null}
      <Entrada
        cinzel={cinzel}
        {...props}
        style={[
          estilos.entrada,
          {
            backgroundColor: tema.campo,
            borderColor: erro ? tema.perigo : tema.bordaCampo,
          },
          props.multiline && estilos.multilinha,
          style,
        ]}
      />
      {erro ? <Texto style={{ fontSize: 11, color: tema.perigo }}>{erro}</Texto> : null}
    </View>
  );
}

/** Pílula de escolha. Ativa: preenchida em ouro. `cor` põe a amostra (disciplina). */
export function Chip(p: {
  rotulo: string;
  ativo?: boolean;
  aoTocar: () => void;
  cor?: string;
  dica?: string;
  desativado?: boolean;
  pequeno?: boolean;
}) {
  const tema = useTema();
  return (
    <Pressable
      onPress={p.desativado ? undefined : p.aoTocar}
      accessibilityRole="button"
      accessibilityLabel={p.dica ?? p.rotulo}
      accessibilityState={{ selected: !!p.ativo, disabled: !!p.desativado }}
      style={[
        estilos.chip,
        p.pequeno && estilos.chipPequeno,
        { borderColor: tema.bordaCampo, opacity: p.desativado ? 0.4 : 1 },
        p.ativo && { backgroundColor: tema.ouro, borderColor: tema.ouro },
      ]}
    >
      {p.cor ? <View style={[estilos.amostra, { backgroundColor: p.cor }]} /> : null}
      <Texto
        style={{
          fontSize: p.pequeno ? 11.5 : 12,
          color: p.ativo ? tema.sobreOuro : tema.texto3,
          fontWeight: p.ativo ? '600' : '400',
        }}
      >
        {p.rotulo}
      </Texto>
    </Pressable>
  );
}

export type VarianteBotao = 'primario' | 'contorno' | 'perigo' | 'neutro';

/**
 * Botão do app. `primario` é o ouro preenchido; `contorno`, o traço dourado; `perigo`, o traço
 * vermelho (excluir, sair); `neutro`, o traço de pergaminho para ações secundárias.
 */
export function Botao(p: {
  rotulo: string;
  aoTocar: () => void;
  variante?: VarianteBotao;
  /** Atalho para `variante="perigo"`. */
  perigo?: boolean;
  desativado?: boolean;
  compacto?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const tema = useTema();
  const v: VarianteBotao = p.variante ?? (p.perigo ? 'perigo' : 'contorno');
  const cores = {
    primario: { fundo: tema.ouro, borda: tema.ouro, texto: tema.sobreOuro },
    contorno: { fundo: 'transparent', borda: tema.ouro, texto: tema.ouroEscuro },
    perigo: { fundo: 'transparent', borda: tema.perigo, texto: tema.perigo },
    neutro: { fundo: 'transparent', borda: tema.bordaCampo, texto: tema.texto3 },
  }[v];
  return (
    // Desativado continua capturando o toque (só não faz nada): com `disabled`, o toque passava
    // para o Pressable de fora — no cartão de recompensa, "Resgatar" em carência abria a edição.
    <Pressable
      onPress={p.desativado ? undefined : p.aoTocar}
      accessibilityRole="button"
      accessibilityLabel={p.rotulo}
      accessibilityState={{ disabled: !!p.desativado }}
      style={[
        estilos.botao,
        p.compacto && estilos.botaoCompacto,
        {
          backgroundColor: cores.fundo,
          borderColor: cores.borda,
          borderWidth: v === 'neutro' ? 1 : 1.5,
          opacity: p.desativado ? 0.4 : 1,
        },
        p.style,
      ]}
    >
      {v === 'neutro' ? (
        <Texto style={{ fontSize: 13, color: cores.texto, textAlign: 'center' }}>{p.rotulo}</Texto>
      ) : (
        <Texto
          cinzel
          style={{
            fontSize: p.compacto ? 11 : 12.5,
            letterSpacing: p.compacto ? 1.3 : 1.9,
            color: cores.texto,
            fontWeight: '600',
            textAlign: 'center',
          }}
        >
          {p.rotulo.toLocaleUpperCase('pt-BR')}
        </Texto>
      )}
    </Pressable>
  );
}

/**
 * Duas (ou mais) opções coladas: "Evento (horário) | Tarefa (prazo)", "SEM | MÊS". `ouro`
 * preenche a ativa em ouro; `pergaminho`, em pergaminho escuro com texto em tinta.
 */
export function Segmentado<T extends string>(p: {
  opcoes: { valor: T; rotulo: string }[];
  valor: T;
  aoMudar: (v: T) => void;
  tom?: 'ouro' | 'pergaminho';
  cinzel?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const tema = useTema();
  const tom = p.tom ?? 'pergaminho';
  return (
    <View style={[estilos.segmentado, { borderColor: tema.ouroClaro }, p.style]}>
      {p.opcoes.map((o) => {
        const ativo = o.valor === p.valor;
        return (
          <Pressable
            key={o.valor}
            onPress={() => p.aoMudar(o.valor)}
            accessibilityRole="button"
            accessibilityState={{ selected: ativo }}
            style={[
              p.cinzel ? estilos.segmentoCinzel : estilos.segmento,
              ativo && { backgroundColor: tom === 'ouro' ? tema.ouro : tema.pontuavel },
            ]}
          >
            <Texto
              cinzel={p.cinzel}
              style={
                p.cinzel
                  ? {
                      fontSize: 10,
                      letterSpacing: 1,
                      color: ativo ? tema.sobreOuro : tema.ouroEscuro,
                    }
                  : {
                      fontSize: 12.5,
                      textAlign: 'center',
                      color: ativo
                        ? tom === 'ouro'
                          ? tema.sobreOuro
                          : tema.texto
                        : tema.ouroEscuro,
                      fontWeight: ativo ? '600' : '400',
                    }
              }
            >
              {o.rotulo}
            </Texto>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Linha de navegação de lista: "Lixeira · 3 itens →". */
export function LinhaDeLista({
  rotulo,
  dica,
  aoTocar,
  seta = true,
  direita,
  ultima = false,
}: {
  rotulo: string;
  dica?: string;
  aoTocar: () => void;
  seta?: boolean;
  direita?: ReactNode;
  ultima?: boolean;
}) {
  const tema = useTema();
  return (
    <Pressable
      onPress={aoTocar}
      accessibilityRole="button"
      style={[
        estilos.linhaLista,
        !ultima && { borderBottomWidth: 1, borderBottomColor: tema.divisoria },
      ]}
    >
      <Texto style={{ fontSize: 14, flexShrink: 1 }}>{rotulo}</Texto>
      <View style={estilos.linhaListaDireita}>
        {dica ? <Texto style={{ fontSize: 11.5, color: tema.apagado }}>{dica}</Texto> : null}
        {direita}
        {seta && !direita ? <SetaDeLista /> : null}
      </View>
    </Pressable>
  );
}

function SetaDeLista() {
  const tema = useTema();
  return <Texto style={{ fontSize: 16, color: tema.inativo, marginTop: -2 }}>›</Texto>;
}

const estilos = StyleSheet.create({
  secao: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  fio: { flex: 1, height: 1 },
  campo: { gap: 6 },
  entrada: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 13,
    paddingVertical: 10,
    fontSize: 14,
  },
  multilinha: { minHeight: 64, textAlignVertical: 'top', lineHeight: 19 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  chipPequeno: { paddingHorizontal: 10, paddingVertical: 5 },
  amostra: { width: 8, height: 8, borderRadius: 2 },
  botao: { borderRadius: 8, paddingVertical: 12, paddingHorizontal: 14, alignItems: 'center' },
  botaoCompacto: { paddingVertical: 9, paddingHorizontal: 12 },
  segmentado: { flexDirection: 'row', borderWidth: 1, borderRadius: 7, overflow: 'hidden' },
  segmento: { flex: 1, paddingVertical: 9, alignItems: 'center', justifyContent: 'center' },
  segmentoCinzel: { paddingVertical: 6, paddingHorizontal: 9 },
  linhaLista: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 13,
    gap: 12,
  },
  linhaListaDireita: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
