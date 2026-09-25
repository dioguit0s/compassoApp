import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

/**
 * Altura do teclado aberto (0 fechado). Com edge-to-edge o Android não encolhe mais a janela,
 * então quem tem campo perto do fim da tela precisa abrir esse espaço por conta própria. No
 * Android a altura já vem sem a barra de navegação.
 */
export function useAlturaTeclado(): number {
  const [altura, setAltura] = useState(0);
  useEffect(() => {
    const ios = Platform.OS === 'ios';
    const abre = Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', (e) =>
      setAltura(e.endCoordinates.height),
    );
    const fecha = Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', () =>
      setAltura(0),
    );
    return () => {
      abre.remove();
      fecha.remove();
    };
  }, []);
  return altura;
}
