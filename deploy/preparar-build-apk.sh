#!/usr/bin/env bash
# Prepara o homeserver para o job gerar-apk (ADR-0016, docs/deploy.md passo 8). Rode como `ash`,
# no servidor, uma vez; rodar de novo não estraga nada (cada passo confere antes de fazer).
#
#   bash deploy/preparar-build-apk.sh
#
# Antes, copie a chave do Windows (a mesma de sempre, NÃO apague a cópia de lá):
#   scp C:/Users/<você>/compasso-release.keystore luna-dash:compasso/chave/
#
# Faz: confere RAM e disco, instala JDK 21 e unzip (sudo), baixa o Android SDK em ~/android-sdk,
# aceita as licenças, instala platform/build-tools/NDK/CMake, escreve JAVA_HOME e ANDROID_HOME no
# .env do runner, cria o ~/.gradle/gradle.properties da chave (pede as senhas) e reinicia o runner.
# O environment `apk` no GitHub é à mão (Settings → Environments), no fim aparece o lembrete.
set -euo pipefail

SDK="${ANDROID_HOME:-$HOME/android-sdk}"
RUNNER="${COMPASSO_RUNNER_DIR:-$HOME/actions-runner-compasso}"
CHAVE_DIR="$HOME/compasso/chave"
CHAVE="$CHAVE_DIR/compasso-release.keystore"
# "Command line tools only" para Linux (https://developer.android.com/studio). Se a Google tirar
# esta versão do ar, troque o número pelo da página.
CMDLINE_URL="${CMDLINE_URL:-https://dl.google.com/android/repository/commandlinetools-linux-13114758_latest.zip}"
PACOTES=("platform-tools" "platforms;android-36" "build-tools;36.0.0" "ndk;27.1.12297006" "cmake;3.22.1")

passo() { printf '\n== %s\n' "$*"; }
aviso() { printf 'AVISO: %s\n' "$*" >&2; }

[[ "$(id -un)" == "ash" ]] || aviso "rodando como $(id -un), não como ash (o runner roda como ash)"

passo "Recursos"
livre_gb=$(awk '/MemAvailable/ {printf "%d", $2/1024/1024}' /proc/meminfo)
disco_gb=$(df -BG --output=avail "$HOME" | tail -1 | tr -dc '0-9')
echo "RAM disponível: ${livre_gb} GB · disco livre em ~: ${disco_gb} GB"
((livre_gb >= 6)) || aviso "o build usa até ~6–8 GB de RAM; com ${livre_gb} GB livres ele pode falhar ou travar o servidor"
((disco_gb >= 12)) || aviso "SDK, NDK e cache do Gradle ocupam ~10 GB; há ${disco_gb} GB livres"

passo "JDK 21 e unzip"
if ! dpkg -s openjdk-21-jdk-headless >/dev/null 2>&1 || ! command -v unzip >/dev/null; then
  sudo apt-get update -qq
  sudo apt-get install -y -qq openjdk-21-jdk-headless unzip curl
fi
JAVA_HOME="$(dirname "$(dirname "$(readlink -f "$(command -v javac)")")")"
echo "JAVA_HOME=$JAVA_HOME ($("$JAVA_HOME/bin/java" -version 2>&1 | head -1))"
export JAVA_HOME

passo "Android SDK em $SDK"
SDKMANAGER="$SDK/cmdline-tools/latest/bin/sdkmanager"
if [[ ! -x "$SDKMANAGER" ]]; then
  tmp="$(mktemp -d)"
  curl -fL --retry 3 -o "$tmp/cmdline.zip" "$CMDLINE_URL"
  unzip -q "$tmp/cmdline.zip" -d "$tmp"
  mkdir -p "$SDK/cmdline-tools"
  rm -rf "$SDK/cmdline-tools/latest"
  mv "$tmp/cmdline-tools" "$SDK/cmdline-tools/latest"
  rm -rf "$tmp"
fi
export ANDROID_HOME="$SDK"
# O `yes` termina com SIGPIPE quando o sdkmanager fecha a entrada: sem pipefail só aqui.
set +o pipefail
yes | "$SDKMANAGER" --licenses >/dev/null
set -o pipefail
"$SDKMANAGER" "${PACOTES[@]}"
echo "Instalado: ${PACOTES[*]}"

passo "Variáveis do runner ($RUNNER/.env)"
[[ -d "$RUNNER" ]] || { echo "ERRO: não achei o runner em $RUNNER (COMPASSO_RUNNER_DIR)" >&2; exit 1; }
touch "$RUNNER/.env"
for par in "JAVA_HOME=$JAVA_HOME" "ANDROID_HOME=$SDK"; do
  nome="${par%%=*}"
  if grep -q "^$nome=" "$RUNNER/.env"; then
    sed -i "s|^$nome=.*|$par|" "$RUNNER/.env"
  else
    echo "$par" >>"$RUNNER/.env"
  fi
done
grep -E '^(JAVA_HOME|ANDROID_HOME)=' "$RUNNER/.env"

passo "Chave de assinatura"
mkdir -p "$CHAVE_DIR" && chmod 700 "$CHAVE_DIR"
if [[ ! -f "$CHAVE" ]]; then
  echo "ERRO: falta $CHAVE. Copie do Windows e rode de novo:" >&2
  echo "  scp C:/Users/<você>/compasso-release.keystore luna-dash:compasso/chave/" >&2
  exit 1
fi
chmod 600 "$CHAVE"
PROPS="$HOME/.gradle/gradle.properties"
mkdir -p "$HOME/.gradle"
touch "$PROPS" && chmod 600 "$PROPS"
if grep -q '^COMPASSO_RELEASE_STORE_FILE=' "$PROPS"; then
  echo "O $PROPS já tem a chave; mantido. (Para trocar, apague as linhas COMPASSO_RELEASE_* e rode de novo.)"
else
  read -rp "Alias da chave [compasso]: " alias
  read -rsp "Senha do keystore: " senha_store && echo
  read -rsp "Senha da chave (Enter = a mesma): " senha_chave && echo
  senha_chave="${senha_chave:-$senha_store}"
  # Confere as senhas antes de gravar: senha errada só apareceria no fim de um build de 20 min.
  if ! "$JAVA_HOME/bin/keytool" -list -keystore "$CHAVE" -storepass "$senha_store" \
    -alias "${alias:-compasso}" >/dev/null 2>&1; then
    echo "ERRO: senha do keystore ou alias errados; nada foi gravado." >&2
    exit 1
  fi
  {
    echo "COMPASSO_RELEASE_STORE_FILE=$CHAVE"
    echo "COMPASSO_RELEASE_STORE_PASSWORD=$senha_store"
    echo "COMPASSO_RELEASE_KEY_ALIAS=${alias:-compasso}"
    echo "COMPASSO_RELEASE_KEY_PASSWORD=$senha_chave"
  } >>"$PROPS"
  echo "Gravado em $PROPS (permissão 600)."
fi

passo "Reiniciando o runner"
(cd "$RUNNER" && sudo ./svc.sh stop && sudo ./svc.sh start) | tail -2

cat <<'FIM'

Pronto no servidor. Falta no GitHub (à mão):
  1. Settings → Environments → New environment "apk" → Required reviewers: você;
     Deployment branches and tags: só main.
  2. Actions → App → Run workflow → marque "simular" (gera o APK sem publicar).
  3. Se o simular passar: no run do merge do PR #104, "Re-run failed jobs" gera o 0.4.0;
     baixe o artefato, teste no celular e aprove o publicar-apk.
FIM
