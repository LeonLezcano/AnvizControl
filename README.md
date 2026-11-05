# ⏱️ CrossChex Control (AnvizControl) • Regondi srl

Sistema Multi-Sucursal Autónomo de Control de Asistencia, Gestión de Fichadas e Ingeniería Inversa de Hardware Biométrico Anviz VF30 Pro. Diseñado bajo el estándar **AiAppFactory Standard** para sustituir el software cerrado de fábrica y operar con total soberanía sobre los relojes biométricos.

---

## 🚀 Características Principales

1. **Ingeniería Inversa del Protocolo Anviz (`TC_B` sobre TCP 5010):**
   - Comunicación nativa vía sockets TCP directamente con el hardware físico.
   - Enlace verificado y probado contra el reloj en `192.168.0.218:5010` (Device ID `1930`, Planta Neuquén 959).
   - Cálculo estricto de Checksum mediante algoritmo **CRC-16/MCRF4XX** (polinomio reflejado `0x8408`, valor inicial `0xFFFF`).
   - Sincronización horaria atómica de hardware (`SET_DATETIME` `0x39` y `GET_DATETIME` `0x38`) en formato `[Year - 2000, Month, Day, Hour, Min, Sec]`.
   - Consulta de contadores internos (`GET_RECORD_INFO` `0x3C`): usuarios, huellas, contraseñas y total de fichadas.

2. **Unificación Multi-Sucursal de Asistencia (Regondi srl):**
   - **Planta Neuquén 959:** Reloj físico local conectado por red LAN (`192.168.0.218:5010`).
   - **Planta Ballarini 1111:** Reloj remoto (a 5 cuadras) con enlace en la nube / CrossChex Push.
   - Resolución de legajos y códigos de usuario independientemente de la sucursal de entrada/salida.
   - Manejo automático de rebotes (dedo apoyado dos veces seguidas en menos de 3 minutos).

3. **Motor T&A (Time & Attendance) y Reportes:**
   - Cálculo de horas normales (hasta 8h) y horas extras diarias.
   - Detección precisa de ausentismo, llegadas tarde con tolerancia configurable (10 min) y fichadas impares.
   - Tablero de monitor en vivo en tiempo real con presencia en planta ("🟢 Adentro" / "🟡 Retirado" / "⚪ Sin Fichar").
   - Rectificación manual auditable de marcas con preservación de Tombstones para evitar re-siembras no deseadas.

4. **Blindaje de Seguridad y Calidad AiAppFactory (Protocolo v4):**
   - **AppSec Guardian Score:** 100/100 (0 Críticas, 0 Altas, 0 Medias, 0 Bajas).
   - Sanitización Zero-Sink DOM (`Sanitizer.safeSetInnerHTML`, `Sanitizer.escapeHTML`).
   - Cabeceras CSP cualitativas estrictas, `X-Frame-Options: DENY`, HSTS y `X-Content-Type-Options: nosniff`.
   - Reglas de Firestore de producción con roles de Administrador y Supervisor (`firestore.rules`).
   - Arnés de 54 pruebas automatizadas en 5 capas con fuzzing caótico.

---

## 🛠️ Especificación del Protocolo Binario Anviz VF30 Pro

### Trama de Solicitud (Host -> Reloj)
```
[STX: 0xA5] [Device ID: 4 Bytes Big-Endian] [CMD: 1 Byte] [LEN: 2 Bytes Big-Endian] [DATA: N Bytes] [CRC16: 2 Bytes Little-Endian]
```

### Trama de Respuesta (Reloj -> Host)
```
[STX: 0xA5] [Device ID: 4 Bytes Big-Endian] [RET_CMD: CMD | 0x80] [STATUS: 1 Byte] [LEN: 2 Bytes Big-Endian] [DATA: N Bytes] [CRC16: 2 Bytes Little-Endian]
```

### Comandos Clave Implementados:
- `0x30`: `GET_INFO1` (Número de serie, versión de firmware, ID de máquina).
- `0x38`: `GET_DATETIME` (Lectura de la hora interna del reloj).
- `0x39`: `SET_DATETIME` (Ajuste del reloj de hardware al segundo exacto).
- `0x3C`: `GET_RECORD_INFO` (Estadísticas de usuarios, huellas y cantidad de fichadas).
- `0x40`: `DOWNLOAD_RECORDS` (Descarga de registros de asistencia históricos o nuevos).
- `0x48`: `GET_DEVICE_MODEL` (Modelo del equipo).
- `0x3A`: `GET_TCPIP_PARAMS` (Configuración de red: IP, máscara, gateway, MAC).

---

## 🧪 Arnés de Pruebas Automatizadas (54 Tests)

Para ejecutar la batería completa de pruebas:
```bash
pnpm test
```

### Capas Cubiertas:
1. **Capa 1: Protocolo Binario & CRC16:** 14 tests que validan framing `TC_B`, checksum CRC-16/MCRF4XX con tramas reales capturadas, encoding/decoding de fecha/hora y payloads extremos.
2. **Capa 2: Motor de Asistencia & Horarios:** 10 tests que verifican conversión a hora local Argentina (UTC-3), resolución multi-sucursal, deduplicación de rebotes, llegadas tarde y tombstones.
3. **Capa 3: Componentes Reactivos & Formateadores:** 5 tests sobre formateo militar HH:mm, fechas AAAA-MM-DD y clasificación de estados de presencia.
4. **Capa 4: Seguridad, CSP & Firestore Rules:** 9 tests que auditan `firestore.rules`, cabeceras de `firebase.json` y aislamiento de secretos.
5. **Capa 5: E2E Fluido & Agente Multi-Sucursal:** 6 tests de ciclo completo de vida del agente, persistencia y estabilidad de memoria bajo 5000 ciclos continuos.
6. **Capa 6: Fuzzing & Propiedades Caóticas:** 10 tests de inputs caóticos, buffers nulos, timestamps negativos y paridad de versiones.

---

## 💻 Ejecución Local

1. Instalar dependencias:
   ```bash
   pnpm install
   ```
2. Iniciar el servidor local:
   ```bash
   pnpm start
   # o: node server/index.mjs
   ```
3. Abrir en el navegador:
   ```
   http://localhost:3000
   ```

---

## 📦 Versión
- **Versión Activa:** `v1.0.03`
- **Estándar:** AiAppFactory v4 (Testing-First & Zero Fake Features)
