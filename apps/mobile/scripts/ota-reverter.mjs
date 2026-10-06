/**
 * Tira do ar o OTA mais recente do APK publicado (ADR-0013). A publicação anterior é republicada
 * com instante novo, porque o expo-updates roda a atualização mais recente que já baixou e não
 * voltaria para uma mais velha. Sem anterior, a API manda os apps de volta ao bundle do APK. Nada
 * é apagado: a pasta revertida vai para ~/compasso/releases/ota-revertidas/, e a novidade dela
 * (ADR-0014) para novidades-revertidas/, saindo do site. Os trailers `Novidade:` desses commits
 * voltam na próxima publicação, que parte da novidade anterior.
 *
 *   npm run ota:reverter -w @compasso/mobile
 *
 * Cuidado: se o bundle revertido trouxe migração do SQLite (drizzle/), o anterior não conhece o
 * banco migrado. Nesse caso corrige-se para frente, com um push novo.
 */
import { spawnSync } from 'node:child_process';

const ssh = process.env.COMPASSO_SSH || 'luna-dash';

// Um script só, rodado no servidor: acha o runtime do APK e move a última publicação dele.
const remoto = `set -e
cd ~/compasso/releases
runtime=$(sed -n 's/.*"runtimeVersion": *"\\([^"]*\\)".*/\\1/p' android/android.json)
[ -n "$runtime" ] || { echo "nenhum APK publicado"; exit 1; }
ultima=$(ls -1 "ota/$runtime" 2>/dev/null | grep -E '^[0-9]{14}-[0-9a-f]+$' | sort | tail -n 1)
[ -n "$ultima" ] || { echo "nenhum OTA publicado para o runtime $runtime"; exit 1; }
mkdir -p "ota-revertidas/$runtime"
mv "ota/$runtime/$ultima" "ota-revertidas/$runtime/"
echo "revertido: $ultima"
# Pelo commit, não pelo instante: uma publicação já republicada pelo reverter tem nome novo, e a
# novidade dela guarda o instante original.
novidade=$(ls -1 novidades 2>/dev/null | grep -E "^[0-9]{14}-ota-\${ultima#*-}[.]json$" | sort | tail -n 1)
novidade="novidades/$novidade"
if [ -f "$novidade" ]; then
  mkdir -p novidades-revertidas
  mv "$novidade" novidades-revertidas/
  echo "novidade fora do site: $novidade"
fi
anterior=$(ls -1 "ota/$runtime" | grep -E '^[0-9]{14}-[0-9a-f]+$' | sort | tail -n 1)
if [ -z "$anterior" ]; then
  echo "no ar agora: o bundle que veio no APK"
  exit 0
fi
# Renomeia (não copia): assim reverter de novo desce para a publicação antes desta.
nova="$(date -u +%Y%m%d%H%M%S)-\${anterior#*-}"
mv "ota/$runtime/$anterior" "ota/$runtime/$nova"
echo "no ar agora: $anterior, republicado como $nova"
`;

const r = spawnSync('ssh', [ssh, 'bash -s'], {
  input: remoto,
  stdio: ['pipe', 'inherit', 'inherit'],
});
process.exit(r.status ?? 1);
